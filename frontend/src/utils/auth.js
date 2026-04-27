export const normalizeRole = (role) => {
  if (typeof role !== 'string') {
    return '';
  }

  return role.trim().toLowerCase();
};

export const normalizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    ...user,
    role: normalizeRole(user.role)
  };
};
