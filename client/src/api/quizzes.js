import { apiRequest } from './client.js';

export function generateQuiz({ file, text, count }) {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('count', String(count));
    return apiRequest('/quizzes/generate', { method: 'POST', formData });
  }
  return apiRequest('/quizzes/generate', { method: 'POST', json: { text, count } });
}

export function saveQuiz(quiz) {
  return apiRequest('/quizzes', { method: 'POST', json: quiz });
}

export function getQuiz(id, { signal } = {}) {
  return apiRequest(`/quizzes/${id}`, { signal });
}

export function getResult(id, { signal } = {}) {
  return apiRequest(`/results/${id}`, { signal });
}
