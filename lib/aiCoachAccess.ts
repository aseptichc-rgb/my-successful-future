import type { NextRequest } from "next/server";
import { AuthError, verifyRequestUser } from "./authServer";
import { hasProAccess } from "./entitlement";

export async function requireCoach(request: NextRequest) {
  const user = await verifyRequestUser(request);
  if (!hasProAccess(user.entitlement)) {
    throw new AuthError(402, "The coach requires an active trial or Pro access.");
  }
  return user;
}
