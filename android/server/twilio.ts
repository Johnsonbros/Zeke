import twilio from 'twilio';
import { jwt } from 'twilio';

const { AccessToken } = jwt;
const { VoiceGrant } = AccessToken;

let connectionSettings: any;
let cachedClient: ReturnType<typeof twilio> | null = null;
let cachedPhoneNumber: string | null = null;
let cachedAccountSid: string | null = null;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  if (cachedClient) return cachedClient;
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  cachedClient = twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
  return cachedClient;
}

export async function getTwilioFromPhoneNumber(): Promise<string> {
  if (cachedPhoneNumber) return cachedPhoneNumber;
  const { phoneNumber } = await getCredentials();
  cachedPhoneNumber = phoneNumber;
  return phoneNumber;
}

export async function getTwilioAccountSid(): Promise<string> {
  if (cachedAccountSid) return cachedAccountSid;
  const { accountSid } = await getCredentials();
  cachedAccountSid = accountSid;
  return accountSid;
}

export interface VoiceAccessTokenResult {
  token: string;
  identity: string;
  expiresIn: number;
}

export async function generateVoiceAccessToken(identity: string): Promise<VoiceAccessTokenResult> {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  
  const accessToken = new AccessToken(
    accountSid,
    apiKey,
    apiKeySecret,
    {
      identity,
      ttl: 3600
    }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: true
  });

  accessToken.addGrant(voiceGrant);

  return {
    token: accessToken.toJwt(),
    identity,
    expiresIn: 3600
  };
}

export interface SmsMessage {
  sid: string;
  to: string;
  from: string;
  body: string;
  status: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-reply';
  dateSent: Date | null;
  dateCreated: Date;
}

export interface SmsConversation {
  phoneNumber: string;
  contactName: string | null;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: SmsMessage[];
}

export interface VoiceCallRecord {
  sid: string;
  to: string;
  from: string;
  status: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  duration: number;
  startTime: Date | null;
  endTime: Date | null;
  dateCreated: Date;
}

export async function sendSms(to: string, body: string): Promise<SmsMessage> {
  const client = await getTwilioClient();
  const from = await getTwilioFromPhoneNumber();
  
  const message = await client.messages.create({
    to,
    from,
    body
  });

  return {
    sid: message.sid,
    to: message.to,
    from: message.from,
    body: message.body || body,
    status: message.status,
    direction: message.direction as SmsMessage['direction'],
    dateSent: message.dateSent,
    dateCreated: message.dateCreated
  };
}

export async function getRecentMessages(limit: number = 50): Promise<SmsMessage[]> {
  const client = await getTwilioClient();
  const from = await getTwilioFromPhoneNumber();
  
  const messages = await client.messages.list({ limit });
  
  return messages
    .filter(m => m.from === from || m.to === from)
    .map(m => ({
      sid: m.sid,
      to: m.to,
      from: m.from,
      body: m.body || '',
      status: m.status,
      direction: m.direction as SmsMessage['direction'],
      dateSent: m.dateSent,
      dateCreated: m.dateCreated
    }));
}

export async function getSmsConversations(): Promise<SmsConversation[]> {
  const messages = await getRecentMessages(100);
  const from = await getTwilioFromPhoneNumber();
  
  const conversationMap = new Map<string, SmsConversation>();
  
  for (const msg of messages) {
    const otherParty = msg.from === from ? msg.to : msg.from;
    
    if (!conversationMap.has(otherParty)) {
      conversationMap.set(otherParty, {
        phoneNumber: otherParty,
        contactName: null,
        lastMessage: msg.body,
        lastMessageTime: msg.dateCreated,
        unreadCount: 0,
        messages: []
      });
    }
    
    const conv = conversationMap.get(otherParty)!;
    conv.messages.push(msg);
    
    if (msg.dateCreated > conv.lastMessageTime) {
      conv.lastMessage = msg.body;
      conv.lastMessageTime = msg.dateCreated;
    }
  }
  
  const conversations = Array.from(conversationMap.values());
  conversations.sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());
  
  return conversations;
}

export async function getConversation(phoneNumber: string): Promise<SmsConversation | null> {
  const messages = await getRecentMessages(100);
  const from = await getTwilioFromPhoneNumber();
  
  const conversationMessages = messages.filter(
    m => (m.from === phoneNumber && m.to === from) || (m.to === phoneNumber && m.from === from)
  );
  
  if (conversationMessages.length === 0) {
    return null;
  }
  
  conversationMessages.sort((a, b) => a.dateCreated.getTime() - b.dateCreated.getTime());
  
  const lastMsg = conversationMessages[conversationMessages.length - 1];
  
  return {
    phoneNumber,
    contactName: null,
    lastMessage: lastMsg.body,
    lastMessageTime: lastMsg.dateCreated,
    unreadCount: 0,
    messages: conversationMessages
  };
}

export async function initiateCall(to: string, statusCallback?: string): Promise<VoiceCallRecord> {
  const client = await getTwilioClient();
  const from = await getTwilioFromPhoneNumber();
  
  const twimlUrl = `http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient`;
  
  const call = await client.calls.create({
    to,
    from,
    url: twimlUrl,
    statusCallback: statusCallback,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
  });

  return {
    sid: call.sid,
    to: call.to,
    from: call.from,
    status: call.status,
    direction: call.direction as VoiceCallRecord['direction'],
    duration: 0,
    startTime: call.startTime,
    endTime: call.endTime,
    dateCreated: call.dateCreated
  };
}

export async function getRecentCalls(limit: number = 50): Promise<VoiceCallRecord[]> {
  const client = await getTwilioClient();
  const from = await getTwilioFromPhoneNumber();
  
  const calls = await client.calls.list({ limit });
  
  return calls
    .filter(c => c.from === from || c.to === from)
    .map(c => ({
      sid: c.sid,
      to: c.to,
      from: c.from,
      status: c.status,
      direction: c.direction as VoiceCallRecord['direction'],
      duration: parseInt(c.duration || '0', 10),
      startTime: c.startTime,
      endTime: c.endTime,
      dateCreated: c.dateCreated
    }));
}

export async function getCallDetails(callSid: string): Promise<VoiceCallRecord | null> {
  const client = await getTwilioClient();
  
  try {
    const call = await client.calls(callSid).fetch();
    
    return {
      sid: call.sid,
      to: call.to,
      from: call.from,
      status: call.status,
      direction: call.direction as VoiceCallRecord['direction'],
      duration: parseInt(call.duration || '0', 10),
      startTime: call.startTime,
      endTime: call.endTime,
      dateCreated: call.dateCreated
    };
  } catch (error) {
    console.error('Error fetching call:', error);
    return null;
  }
}
