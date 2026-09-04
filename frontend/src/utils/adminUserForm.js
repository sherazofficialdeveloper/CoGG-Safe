export function userEditFormValues(user) {
  return {
    username: user?.username || user?.name || '',
    mobileNumber: user?.mobileNumber || user?.phone || '',
    email: user?.email === 'No email configured' ? '' : (user?.email || ''),
  };
}
