export const gfEmail = {
  recoverySubject: 'Password recovery',
  registerSubject: `Email confirmation`,
  registerText: (recoveryLink: string) =>
    `To confirm your email, follow the link: ${recoveryLink}`,
  recoveryText: (recoveryLink: string) =>
    `To recover your password, follow the link: ${recoveryLink}`,
  from: `"${process.env.APP_NAME}" team`,
};
