/// <reference types="astro/client" />

type Env = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  SECRET_KEY: string;
  MAILER?: { send: (message: any) => Promise<void> };
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_STANDARD?: string;
};

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
      cf?: any;
    };
    session?: {
      kanzlei_id: string;
      user_id: string;
      email: string;
      role: 'admin' | 'member';
      session_token_hash: string | null;
    };
  }
}

declare module 'cloudflare:email' {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string);
  }
}
