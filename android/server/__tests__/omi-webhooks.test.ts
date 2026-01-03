import express, { type Request } from "express";
import crypto from "crypto";
import request from "supertest";

import { verifyOmiWebhook } from "../omi-webhooks";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

describe("Omi webhook verification", () => {
  const secret = "test-secret";

  beforeAll(() => {
    process.env.OMI_WEBHOOK_SECRET = secret;
  });

  afterAll(() => {
    delete process.env.OMI_WEBHOOK_SECRET;
  });

  it("verifies signatures using the raw request body", async () => {
    const app = express();

    app.use(express.json({
      verify: (req: RawBodyRequest, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }));

    app.post("/test-webhook", (req, res) => {
      if (verifyOmiWebhook(req as RawBodyRequest)) {
        return res.status(200).json({ ok: true });
      }

      return res.status(401).json({ ok: false });
    });

    const rawPayload = '{\n  "hello": "world"\n}';
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawPayload)
      .digest("hex");

    const response = await request(app)
      .post("/test-webhook")
      .set("x-omi-signature", signature)
      .set("content-type", "application/json")
      .send(rawPayload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
