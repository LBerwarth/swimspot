import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n";

/** « / » → /fr ou /en selon la langue du navigateur. */
export function proxy(request: NextRequest) {
  const accepted = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => part.trim().slice(0, 2).toLowerCase());
  const locale =
    accepted.find((code) => (LOCALES as string[]).includes(code)) ??
    DEFAULT_LOCALE;
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = {
  matcher: ["/"],
};
