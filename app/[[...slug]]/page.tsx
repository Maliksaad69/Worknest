"use client";

import dynamic from "next/dynamic";
import { Providers } from "../../components/Providers";

const App = dynamic(() => import("../../components/App"), { ssr: false });

export default function Home() {
  return (
    <Providers>
      <App />
    </Providers>
  );
}
