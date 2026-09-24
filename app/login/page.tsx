import { Suspense } from "react"
import LoginForm from "./LoginForm"

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
          }}
        >
          <p>Loading CivilBid...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
