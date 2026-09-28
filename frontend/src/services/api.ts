import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL) {
  throw new Error("VITE_API_URL environment variable is missing.");
}

const api = axios.create({
  baseURL,
  timeout: 10000,
})

export default api
