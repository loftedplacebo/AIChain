import { Footer, PageHeader } from "../components";
import { CustomerServiceFilm } from "../customer-service-film";

export const metadata = { title: "One trusted record | Orvessian", description: "A short illustrative story of a customer, a support lead and one trusted record.", openGraph: { images: [] }, twitter: { images: [] } };

export default function FilmPage() {
  return <main><PageHeader label="A customer story / illustrative film" title="One action. Different views. One trusted record."><p>A short visual story of an AI assistant, an exception, a human decision and the shared record that follows.</p></PageHeader><CustomerServiceFilm /><Footer /></main>;
}
