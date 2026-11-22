import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function copyCookies(source: NextResponse, destination: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    destination.cookies.set(cookie);
  }
  return destination;
}

function safeDestination(value: string | null, origin: string): URL {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return new URL("/", origin);
  }

  const destination = new URL(value, origin);
  if (destination.origin !== origin || destination.pathname === "/login") {
    return new URL("/", origin);
  }

  return destination;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // API routes return JSON 401 responses from their own handlers. Do not turn
  // those responses into browser redirects.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    if (pathname === "/login") {
      return NextResponse.next();
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "supabase_not_configured");
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Supabase SSR requires refreshed cookies to be written to both the
        // request (for downstream server code) and response (for the browser).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (pathname === "/login") {
    if (user && !error) {
      const destination = safeDestination(
        request.nextUrl.searchParams.get("next"),
        request.nextUrl.origin,
      );
      return copyCookies(response, NextResponse.redirect(destination));
    }

    return response;
  }

  if (error || !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
