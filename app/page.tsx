import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">SUDAM PVP</h1>
        <p className="text-center mb-8">Real-time Baduk Game</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
          >
            로그인
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-gray-600 px-6 py-3 text-white hover:bg-gray-700"
          >
            회원가입
          </Link>
        </div>
      </div>
    </main>
  );
}
