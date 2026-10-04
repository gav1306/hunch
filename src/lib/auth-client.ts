import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Module scope: no router here, and a full load to /2fa is fine.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/2fa";
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession, twoFactor } = authClient;
