import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Plus,
  TrendingUp,
  Filter,
  X
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRequests } from '@/context/RequestContext';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import KPICard from '@/components/dashboard/KPICard';
import RequestsTable from '@/components/dashboard/RequestsTable';
import { CustomerRequest, RequestStatus, STATUS_CONFIG } from '@/types';

type FilterType = 'all' | RequestStatus | 'in_progress' | 'completed' | 'needs_attention' | 'costing_processed';
type OwnershipFilter = 'all' | 'mine';

// Completed means finished/approved/closed. A GM rejection returns to Sales follow-up (WIP).
const FINAL_STATUSES: RequestStatus[] = ['gm_approved', 'closed'];
const NEEDS_ATTENTION_STATUSES: RequestStatus[] = ['clarification_needed'];
const IN_PROGRESS_STATUSES: RequestStatus[] = [
  'submitted',
  'edited',
  'under_review',
  'feasibility_confirmed',
  'design_result',
  'in_costing',
  'costing_complete',
  'sales_followup',
  'gm_approval_pending',
  // Backward-compat: older requests may have gm_rejected as current status.
  'gm_rejected',
];
const COSTING_PROCESSED_STATUSES: RequestStatus[] = [
  // "Processed" means costing is completed (or later), not just started.
  'costing_complete',
  'sales_followup',
  'gm_approval_pending',
  'gm_approved',
  // Backward-compat: older requests may have gm_rejected as current status.
  'gm_rejected',
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { requests, deleteRequest } = useRequests();
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');

  // All roles can see all requests - they use filters to focus on relevant ones
  const roleFilteredRequests = useMemo(() => {
    if (!user) return [];
    return requests;
  }, [requests, user]);

  // Apply ownership filter
  const ownershipFilteredRequests = useMemo(() => {
    if (ownershipFilter === 'mine' && user) {
      return roleFilteredRequests.filter(r => r.createdBy === user.id);
    }
    return roleFilteredRequests;
  }, [roleFilteredRequests, ownershipFilter, user]);

  // Apply active filter to get displayed requests
  const filteredRequests = useMemo(() => {
    if (activeFilter === 'all') return ownershipFilteredRequests;
    
    // Handle compound filters
    if (activeFilter === 'in_progress') {
      return ownershipFilteredRequests.filter(r => IN_PROGRESS_STATUSES.includes(r.status));
    }
    if (activeFilter === 'completed') {
      return ownershipFilteredRequests.filter(r => 
        FINAL_STATUSES.includes(r.status)
      );
    }
    if (activeFilter === 'needs_attention') {
      return ownershipFilteredRequests.filter(r => NEEDS_ATTENTION_STATUSES.includes(r.status));
    }
    if (activeFilter === 'costing_processed') {
      return ownershipFilteredRequests.filter(r => COSTING_PROCESSED_STATUSES.includes(r.status));
    }
    
    // Single status filter
    return ownershipFilteredRequests.filter(r => r.status === activeFilter);
  }, [ownershipFilteredRequests, activeFilter]);

  // Calculate KPIs based on role
  const kpis = useMemo(() => {
    if (!user) return [];
    
    // Keep KPI counts consistent with the table "All/My requests" scope.
    const baseRequests = ownershipFilteredRequests;

    const countByStatus = (statuses: RequestStatus[]) =>
      baseRequests.filter(r => statuses.includes(r.status)).length;

    const countInProgress = () => baseRequests.filter(r => IN_PROGRESS_STATUSES.includes(r.status)).length;
    const countCompleted = () => baseRequests.filter(r => FINAL_STATUSES.includes(r.status)).length;
    const countNeedsAttention = () => baseRequests.filter(r => NEEDS_ATTENTION_STATUSES.includes(r.status)).length;

    switch (user.role) {
      case 'sales':
        return [
          { title: t.dashboard.totalRequests, value: baseRequests.length, icon: FileText, filterValue: 'all' as FilterType },
          { title: t.dashboard.drafts, value: countByStatus(['draft']), icon: Clock, filterValue: 'draft' as FilterType },
          { title: t.dashboard.pendingReview, value: countInProgress(), icon: AlertCircle, filterValue: 'in_progress' as FilterType },
          { title: t.dashboard.clarificationNeeded, value: countByStatus(['clarification_needed']), icon: AlertCircle, filterValue: 'clarification_needed' as FilterType },
        ];
      case 'design':
        return [
          { title: t.dashboard.toReview, value: countByStatus(['submitted']), icon: FileText, filterValue: 'submitted' as FilterType },
          { title: t.dashboard.underReview, value: countByStatus(['under_review']), icon: Clock, filterValue: 'under_review' as FilterType },
          { title: t.dashboard.awaitingClarification, value: countByStatus(['clarification_needed']), icon: AlertCircle, filterValue: 'clarification_needed' as FilterType },
          // For Design: "approved" means Design Result is submitted (ready for costing).
          { title: t.dashboard.approved, value: countByStatus(['design_result']), icon: CheckCircle, filterValue: 'design_result' as FilterType },
        ];
      case 'costing':
        return [
          // "Ready for costing" starts only after Design Result is submitted.
          { title: t.dashboard.readyForCosting, value: countByStatus(['design_result']), icon: FileText, filterValue: 'design_result' as FilterType },
          { title: t.dashboard.inCosting, value: countByStatus(['in_costing']), icon: Clock, filterValue: 'in_costing' as FilterType },
          { title: t.dashboard.completed, value: countByStatus(['costing_complete']), icon: CheckCircle, filterValue: 'costing_complete' as FilterType },
          { title: t.dashboard.totalProcessed, value: countByStatus(COSTING_PROCESSED_STATUSES), icon: TrendingUp, filterValue: 'costing_processed' as FilterType },
        ];
      case 'admin':
        return [
          { title: t.dashboard.totalRequests, value: baseRequests.length, icon: FileText, filterValue: 'all' as FilterType },
          { title: t.dashboard.inProgress, value: countInProgress(), icon: Clock, filterValue: 'in_progress' as FilterType },
          { title: t.dashboard.completed, value: countCompleted(), icon: CheckCircle, filterValue: 'completed' as FilterType },
          { title: t.dashboard.needsAttention, value: countNeedsAttention(), icon: AlertCircle, filterValue: 'needs_attention' as FilterType },
        ];
      default:
        return [];
    }
  }, [ownershipFilteredRequests, user, t]);

  const handleDelete = async (id: string) => {
    await deleteRequest(id);
  };

  const handleKPIClick = (filterValue: FilterType) => {
    setActiveFilter(prev => prev === filterValue ? 'all' : filterValue);
  };

  const clearFilter = () => {
    setActiveFilter('all');
  };

  const showCreateButton = user?.role === 'sales' || user?.role === 'admin';

  // Get all available statuses for the filter dropdown
  const availableStatuses = useMemo(() => {
    const statuses = new Set(roleFilteredRequests.map(r => r.status));
    return Array.from(statuses);
  }, [roleFilteredRequests]);

  // Get translated status label
  const getStatusLabel = (status: RequestStatus) => {
    return t.statuses[status] || STATUS_CONFIG[status]?.label || status;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t.dashboard.title}</h1>
          <p className="text-muted-foreground mt-1">
            {t.dashboard.welcome}, {user?.name}
          </p>
        </div>
        
        {showCreateButton && (
          <Button 
            onClick={() => navigate('/requests/new')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all"
          >
            <Plus size={18} className="mr-2" />
            {t.nav.newRequest}
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, index) => (
          <div 
            key={kpi.title}
            className="animate-slide-up h-full"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <KPICard
              title={kpi.title}
              value={kpi.value}
              icon={kpi.icon}
              onClick={() => handleKPIClick(kpi.filterValue)}
              isActive={activeFilter === kpi.filterValue}
            />
          </div>
        ))}
      </div>

      {/* Requests Table */}

      {/* Requests Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{t.dashboard.requests}</h2>
            <span className="text-sm text-muted-foreground">
              {filteredRequests.length} {activeFilter !== 'all' || ownershipFilter !== 'all' ? t.common.filtered : t.common.total}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(activeFilter !== 'all' || ownershipFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearFilter();
                  setOwnershipFilter('all');
                }}
                className="text-muted-foreground"
              >
                <X size={14} className="mr-1" />
                {t.common.clearFilters}
              </Button>
            )}

            <Select value={ownershipFilter} onValueChange={(value) => setOwnershipFilter(value as OwnershipFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t.dashboard.ownership} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                <SelectItem value="all">{t.dashboard.allRequests}</SelectItem>
                <SelectItem value="mine">{t.dashboard.myRequests}</SelectItem>
              </SelectContent>
            </Select>
            
             <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as FilterType)}>
              <SelectTrigger className="w-[180px]">
                <Filter size={14} className="mr-2" />
                <SelectValue placeholder={t.common.filter} />
              </SelectTrigger>
                <SelectContent className="bg-card border border-border">
                  <SelectItem value="all">{t.dashboard.allStatuses}</SelectItem>
                  <SelectItem value="in_progress">{t.dashboard.inProgress}</SelectItem>
                  <SelectItem value="completed">{t.dashboard.completed}</SelectItem>
                  <SelectItem value="needs_attention">{t.dashboard.needsAttention}</SelectItem>
                  {user?.role === 'costing' && (
                    <SelectItem value="costing_processed">{t.dashboard.totalProcessed}</SelectItem>
                  )}
                  {availableStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getStatusLabel(status)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <RequestsTable 
          requests={filteredRequests}
          userRole={user?.role || 'sales'}
          onDelete={user?.role === 'admin' ? handleDelete : undefined}
        />
      </div>
    </div>
  );
};

export default Dashboard;
