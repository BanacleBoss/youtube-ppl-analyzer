import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import PublicSummary from './PublicSummary';

// 별도 라우터 라이브러리 없이, /share/:token 경로일 때만 공유 전용 페이지를 띄운다.
// (그 외 모든 경로는 기존과 동일하게 메인 앱을 렌더링)
const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)/);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {shareMatch ? <PublicSummary token={shareMatch[1]} /> : <App />}
  </React.StrictMode>
);
