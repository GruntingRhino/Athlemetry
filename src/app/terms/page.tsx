import { ProductNoticePage } from "@/components/legal/product-notice-page";

export const dynamic = "force-static";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return <ProductNoticePage kind="terms" />;
}
