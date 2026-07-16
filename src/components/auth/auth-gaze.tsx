"use client";

import { createContext, useContext } from "react";

/**
 * Bridges the password field (in the form, right panel) to the mascot (in the
 * shell, left panel) so the bot can look away while you type your password.
 * The form only writes; the shell owns the boolean and feeds it to the robot.
 * Default is a no-op so the form still renders fine outside the provider.
 */
export type AuthGaze = { setPasswordFocused: (focused: boolean) => void };

const AuthGazeContext = createContext<AuthGaze>({
  setPasswordFocused: () => {},
});

export const AuthGazeProvider = AuthGazeContext.Provider;

export function useAuthGaze(): AuthGaze {
  return useContext(AuthGazeContext);
}
