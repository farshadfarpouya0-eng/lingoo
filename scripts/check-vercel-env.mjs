import dotenv from "dotenv";
import { validateHostedEnvironment } from "./hosted-env.mjs";

dotenv.config({ quiet: true });
validateHostedEnvironment("Vercel");
