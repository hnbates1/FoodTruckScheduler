import Link from "next/link";

export const metadata = {
  title: "Terms | Food Truck Admin",
};

export default function TermsPage() {
  return <main className="legal-page">
    <article>
      <p className="eyebrow">FOOD TRUCK ADMIN</p>
      <h1>Terms of Use</h1>
      <p>Food Truck Admin is an operational scheduling tool. Authorized users are responsible for checking schedule, contact, compliance, attendance, and business-listing information before relying on it.</p>
      <h2>Online Ratings</h2>
      <p>Google ratings and summaries are provided by Google, may be incomplete, and can change at any time. They should be treated as one planning signal—not as a guarantee of quality, availability, identity, or compliance.</p>
      <h2>Google Maps Platform</h2>
      <p>Use of Google-sourced information is subject to the <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps/Google Earth Additional Terms of Service</a> and the <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Google Terms of Service</a>.</p>
      <Link className="secondary" href="/">← Return to Food Truck Admin</Link>
    </article>
  </main>;
}
