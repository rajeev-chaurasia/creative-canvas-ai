const LoginPage = () => {
  const handleLogin = () => {
    // Redirect to the backend's Google auth endpoint
    window.location.href = 'http://localhost:8000/auth/google';
  };

  return (
    <div>
      <h1>Welcome to Creative Canvas AI</h1>
      <p>Please sign in to continue</p>
      <button onClick={handleLogin}>Sign In with Google</button>
    </div>
  );
};

export default LoginPage;
