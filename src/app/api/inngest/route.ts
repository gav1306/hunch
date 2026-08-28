import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

/**
 * Where Inngest reaches the app. The dev server discovers this path on its own;
 * in production it is the URL registered for the app.
 */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
