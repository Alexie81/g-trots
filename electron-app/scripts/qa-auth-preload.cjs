const originalFetch = window.fetch.bind(window);
const user = {
  id: 'qa-user',
  username: 'qa-admin',
  display_name: 'QA Admin',
  role: 'admin',
  is_active: true,
};

window.fetch = async (input, options) => {
  const url = String(input || '');
  if (url.includes('action=login')) {
    return new Response(JSON.stringify({ success: true, token: 'qa-persistent-token', user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('action=getCurrentUser')) {
    return new Response(JSON.stringify(user), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('action=logout')) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return originalFetch(input, options);
};
