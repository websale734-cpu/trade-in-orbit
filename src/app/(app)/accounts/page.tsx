import type { Metadata } from "next";
import { AccountsOverview } from "./overview";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return <AccountsOverview />;
}
