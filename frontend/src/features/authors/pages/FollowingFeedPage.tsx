import React from 'react';
import { Navigate } from 'react-router-dom';

export const FollowingFeedPage: React.FC = () => <Navigate to="/discovery?tab=following" replace />;
export default FollowingFeedPage;
