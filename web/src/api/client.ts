import ky from 'ky';

const api = ky.create({
  prefixUrl: '/api',
  hooks: {
    beforeRequest: [
      (request) => {
        const wsId = localStorage.getItem('workspaceId') || '1';
        request.headers.set('X-Workspace-ID', wsId);
      },
    ],
  },
});

export default api;
