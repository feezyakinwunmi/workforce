import { redirect } from "next/navigation";
import { requestBase } from "@/lib/meet/server";

/** Meeting time isn't shown to people any more (paid plans have no visible limits): old links go to Pricing. */
export default async function UsagePage() {
  redirect(`${await requestBase()}/pricing`);
}
