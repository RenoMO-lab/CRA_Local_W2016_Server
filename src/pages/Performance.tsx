import React from 'react';
import WorkflowPerformance from '@/components/performance/WorkflowPerformance';
import { useRequests } from '@/context/RequestContext';

const Performance: React.FC = () => {
  const { requests } = useRequests();

  return (
    <WorkflowPerformance requests={requests} />
  );
};

export default Performance;
