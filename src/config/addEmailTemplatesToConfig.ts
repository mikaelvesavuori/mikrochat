export function addEmailTemplatesToConfig(config: any) {
  return {
    ...config,
    auth: {
      ...config.auth,
      templates: {
        textVersion: (magicLink: string, expiryMinutes: number) => {
          return `
Sign in to MikroChat: ${magicLink}
This link expires in ${expiryMinutes} minutes and can only be used once.
If you didn't request this, please ignore this email.
`;
        },
        htmlVersion: (magicLink: string, expiryMinutes: number) => {
          return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to MikroChat</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 2rem;">
    <h1 style="font-size: 1.5rem; font-weight: 600; margin: 0 0 1rem 0; color: #202020;">Sign in to MikroChat</h1>
    <p style="font-size: 0.9rem; line-height: 1.5; margin: 0 0 1.5rem 0; color: #646464;">Click the button below to sign in to your account.</p>
    <a href="${magicLink}" style="display: inline-block; padding: 0.75rem 1.5rem; background-color: #3e63dd; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 0.9rem; font-weight: 500;">Sign in</a>
    <p style="font-size: 0.8rem; line-height: 1.5; margin: 1.5rem 0 0 0; color: #8d8d8d;">This link expires in ${expiryMinutes} minutes and can only be used once. If you didn't request this, please ignore this email.</p>
  </div>
</body>
</html>
`;
        }
      }
    }
  };
}
