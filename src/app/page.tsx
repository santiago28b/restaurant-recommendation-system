import PlacesSearchForm from "./places-search-form";

export default function Home() {
  return (
    <main>
      <h1>Restaurant Recommendations</h1>
      <p className="muted">
        Early build: this searches nearby restaurants through Google Places. Ranking and
        explanations come next.
      </p>
      <PlacesSearchForm />
    </main>
  );
}
