import { ProductNoticePage } from "@/components/legal/product-notice-page";

export const dynamic = "force-static";

export const metadata = { title: "Privacy notice" };

export default function PrivacyNoticePage() {
  return <ProductNoticePage kind="privacy" />;
}
