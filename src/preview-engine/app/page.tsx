export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Velu Preview Service</h1>
      <p>Multi-tenant documentation preview server.</p>
      <p>
        Access a session&apos;s preview at{' '}
        <code>/{'{sessionId}'}/docs/...</code>
      </p>
    </div>
  );
}
