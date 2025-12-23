/**
 * Agent Applications Module
 * 
 * Handles ZEKE agent application submissions and management.
 */

import type { Express, Request, Response } from 'express';
import { db } from './db';
import { eq, desc, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '@shared/schema';
import { 
  insertAgentApplicationSchema,
  updateAgentApplicationSchema,
  MASTER_ADMIN_PHONE,
  type AgentApplication,
} from '@shared/schema';
import { requireWebAuth } from './web-auth';
import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from './twilioClient';

function getNow(): string {
  return new Date().toISOString();
}

function getMasterPhone(): string | null {
  const override = process.env.ZEKE_MASTER_PHONE;
  if (override) return override;
  return MASTER_ADMIN_PHONE ? `+1${MASTER_ADMIN_PHONE}` : null;
}

async function notifyNewApplication(app: AgentApplication): Promise<void> {
  try {
    const twilioReady = await isTwilioConfigured();
    const masterPhone = getMasterPhone();
    
    if (!twilioReady || !masterPhone) {
      console.log('[APPLICATIONS] Cannot notify - Twilio or master phone not configured');
      return;
    }
    
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    const message = `New ZEKE Agent Application!\n\nFrom: ${app.firstName} ${app.lastName}\nEmail: ${app.email}\nPhone: ${app.phoneNumber}\n\nUse case: ${app.useCase.substring(0, 100)}${app.useCase.length > 100 ? '...' : ''}\n\nReview in dashboard.`;
    
    await client.messages.create({
      body: message,
      from: fromNumber,
      to: masterPhone
    });
    
    console.log(`[APPLICATIONS] Notified admin of new application from ${app.email}`);
  } catch (error) {
    console.error('[APPLICATIONS] Failed to send notification:', error);
  }
}

export function registerApplicationEndpoints(app: Express): void {
  app.post('/api/applications', async (req: Request, res: Response) => {
    try {
      const parseResult = insertAgentApplicationSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ 
          success: false, 
          error: "Invalid application data",
          details: parseResult.error.flatten().fieldErrors
        });
        return;
      }
      
      const data = parseResult.data;
      const now = getNow();
      const id = uuidv4();
      
      const [existingByEmail] = await db.select().from(schema.agentApplications)
        .where(and(
          eq(schema.agentApplications.email, data.email),
          eq(schema.agentApplications.status, 'pending')
        ));
      
      if (existingByEmail) {
        res.status(409).json({
          success: false,
          error: "You already have a pending application. We'll be in touch soon!"
        });
        return;
      }
      
      const [application] = await db.insert(schema.agentApplications).values({
        id,
        ...data,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }).returning();
      
      notifyNewApplication(application);
      
      res.status(201).json({
        success: true,
        message: "Application submitted successfully! We'll review it and get back to you soon.",
        applicationId: application.id
      });
      
    } catch (error: any) {
      console.error('[APPLICATIONS] Error submitting application:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to submit application. Please try again." 
      });
    }
  });
  
  app.get('/api/applications', requireWebAuth(true), async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      
      let query = db.select().from(schema.agentApplications);
      
      if (status && schema.applicationStatuses.includes(status as any)) {
        query = query.where(eq(schema.agentApplications.status, status as any)) as any;
      }
      
      const applications = await query.orderBy(desc(schema.agentApplications.createdAt));
      
      res.status(200).json({ success: true, applications });
      
    } catch (error: any) {
      console.error('[APPLICATIONS] Error fetching applications:', error);
      res.status(500).json({ success: false, error: "Failed to fetch applications" });
    }
  });
  
  app.get('/api/applications/:id', requireWebAuth(true), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const [application] = await db.select().from(schema.agentApplications)
        .where(eq(schema.agentApplications.id, id));
      
      if (!application) {
        res.status(404).json({ success: false, error: "Application not found" });
        return;
      }
      
      res.status(200).json({ success: true, application });
      
    } catch (error: any) {
      console.error('[APPLICATIONS] Error fetching application:', error);
      res.status(500).json({ success: false, error: "Failed to fetch application" });
    }
  });
  
  app.patch('/api/applications/:id', requireWebAuth(true), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = (req as any).webSession;
      
      const parseResult = updateAgentApplicationSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ 
          success: false, 
          error: "Invalid update data",
          details: parseResult.error.flatten().fieldErrors
        });
        return;
      }
      
      const data = parseResult.data;
      const now = getNow();
      
      const updateData: any = {
        ...data,
        updatedAt: now,
      };
      
      if (data.status) {
        updateData.reviewedAt = now;
        updateData.reviewedBy = session.phoneNumber;
      }
      
      const [updated] = await db.update(schema.agentApplications)
        .set(updateData)
        .where(eq(schema.agentApplications.id, id))
        .returning();
      
      if (!updated) {
        res.status(404).json({ success: false, error: "Application not found" });
        return;
      }
      
      res.status(200).json({ success: true, application: updated });
      
    } catch (error: any) {
      console.error('[APPLICATIONS] Error updating application:', error);
      res.status(500).json({ success: false, error: "Failed to update application" });
    }
  });
  
  app.get('/api/applications/stats/summary', requireWebAuth(true), async (_req: Request, res: Response) => {
    try {
      const applications = await db.select().from(schema.agentApplications);
      
      const stats = {
        total: applications.length,
        pending: applications.filter(a => a.status === 'pending').length,
        approved: applications.filter(a => a.status === 'approved').length,
        rejected: applications.filter(a => a.status === 'rejected').length,
        waitlisted: applications.filter(a => a.status === 'waitlisted').length,
      };
      
      res.status(200).json({ success: true, stats });
      
    } catch (error: any) {
      console.error('[APPLICATIONS] Error fetching stats:', error);
      res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
  });
}
