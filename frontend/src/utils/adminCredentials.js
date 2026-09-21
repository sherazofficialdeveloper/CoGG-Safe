export function credentialClipboardText(member, password) {
  if (!member?.username) return '';
  return password ? `${member.username}\n${password}` : `${member.username}\nPassword unavailable`;
}

export function rememberCredential(credentials, user, password) {
  const id = user?._id || user?.id;
  return id && password ? {...credentials, [id]: password} : credentials;
}
