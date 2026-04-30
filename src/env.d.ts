/// <reference types="astro/client" />

type Env = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  SECRET_KEY: string;
  MAILER?: { send: (message: any) => Promise<void> };
};

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
      cf?: any;
    };
    session?: {
      kanzlei_id: string;
      email: string;
    };
  }
}

declare module 'cloudflare:email' {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string);
  }
}
