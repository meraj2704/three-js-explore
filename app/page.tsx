import Scene from "./components/Scene";

/**
 * Home page — stays a Server Component; only <Scene> ships as client JS.
 */
export default function Home() {
  return (
    <main className="h-screen w-full bg-zinc-950">
      <Scene />
    </main>
  );
}
