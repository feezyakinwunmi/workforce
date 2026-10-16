import { NextResponse, type NextRequest } from "next/server";
import { bookingIcs } from "@/lib/book/mail";
import { bookLink } from "@/lib/book/paths";
import type { BookingView } from "@/lib/book/types";
import { createClient } from "@/lib/supabase/server";

/** Calendar file for a booking (Add to calendar). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("book_get", { p_token: token });
  const b = data as BookingView | null;
  if (!b) return new NextResponse("Not found", { status: 404 });
  const manage = bookLink(`/b/${token}`, request.nextUrl.origin);
  const ics = bookingIcs({ ...b, page_name: b.page.name }, manage, b.status === "cancelled");
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
