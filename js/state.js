export const state = {
  user: null,
  token: null,
};

export function setUser(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("token", token);
}

export function loadUserFromStorage() {
  const userData = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  if (userData && token) {
    state.user = JSON.parse(userData);
    state.token = token;
  }
}

export function logout() {
  state.user = null;
  state.token = null;
  localStorage.clear();
}
