import dotenv from "dotenv";

dotenv.config({ path: "/etc/portal-digitale/backend.env", quiet: true });

export const config = {
  apiHost: process.env.API_HOST || "127.0.0.1",
  apiPort: Number(process.env.API_PORT || 8114),
  jwtSecret: process.env.JWT_SECRET,
  uploadDir: process.env.UPLOAD_DIR || "/var/lib/portal-digitale/uploads",
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || "portal_digitale",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  siteLeadSecret:
    process.env.SITE_LEAD_SECRET || "",

  siteLeadOwnerId:
    process.env.SITE_LEAD_OWNER_ID || "",

  dailyApiKey: process.env.DAILY_API_KEY || "",
};
