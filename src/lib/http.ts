import { NextResponse } from "next/server";
export function jsonError(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
export function noStore(response: NextResponse) { response.headers.set("Cache-Control", "no-store, max-age=0"); return response; }
