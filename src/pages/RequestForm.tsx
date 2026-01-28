import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useRequests } from '@/context/RequestContext';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Attachment, CustomerRequest, FormMode, RequestStatus, RequestProduct } from '@/types';
import SectionGeneralInfo from '@/components/request/SectionGeneralInfo';
import SectionExpectedDelivery from '@/components/request/SectionExpectedDelivery';
import SectionClientApplication from '@/components/request/SectionClientApplication';
import SectionTechnicalInfo from '@/components/request/SectionTechnicalInfo';
import SectionAdditionalInfo from '@/components/request/SectionAdditionalInfo';
import DesignReviewPanel from '@/components/request/DesignReviewPanel';
import CostingPanel from '@/components/request/CostingPanel';
import ClarificationPanel from '@/components/request/ClarificationPanel';
import StatusTimeline from '@/components/request/StatusTimeline';
import DesignResultSection from '@/components/request/DesignResultSection';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, ArrowRight, CheckCircle, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

type FormStep = 'chapters' | 'product' | 'review';

const getInitialProduct = (): RequestProduct => ({
  axleLocation: '',
  axleLocationOther: '',
  articulationType: '',
  articulationTypeOther: '',
  configurationType: '',
  configurationTypeOther: '',
  loadsKg: null,
  speedsKmh: null,
  tyreSize: '',
  trackMm: null,
  studsPcdMode: 'standard',
  studsPcdStandardSelections: [],
  studsPcdSpecialText: '',
  wheelBase: '',
  finish: 'Black Primer default',
  brakeType: null,
  brakeSize: '',
  suspension: '',
  productComments: '',
  attachments: [],
});

const cloneProductForNext = (source: RequestProduct): RequestProduct => ({
  ...source,
  attachments: [],
  productComments: '',
});

const buildLegacyProduct = (request: Partial<CustomerRequest>): RequestProduct => ({
  axleLocation: request.axleLocation ?? '',
  axleLocationOther: request.axleLocationOther ?? '',
  articulationType: request.articulationType ?? '',
  articulationTypeOther: request.articulationTypeOther ?? '',
  configurationType: request.configurationType ?? '',
  configurationTypeOther: request.configurationTypeOther ?? '',
  loadsKg: request.loadsKg ?? null,
  speedsKmh: request.speedsKmh ?? null,
  tyreSize: request.tyreSize ?? '',
  trackMm: request.trackMm ?? null,
  studsPcdMode: request.studsPcdMode ?? 'standard',
  studsPcdStandardSelections: Array.isArray(request.studsPcdStandardSelections) ? request.studsPcdStandardSelections : [],
  studsPcdSpecialText: request.studsPcdSpecialText ?? '',
  wheelBase: request.wheelBase ?? '',
  finish: request.finish ?? 'Black Primer default',
  brakeType: request.brakeType ?? null,
  brakeSize: request.brakeSize ?? '',
  suspension: request.suspension ?? '',
  productComments: typeof (request as any).productComments === 'string'
    ? (request as any).productComments
    : request.otherRequirements ?? '',
  attachments: Array.isArray(request.attachments) ? request.attachments : [],
});

const normalizeProducts = (request?: Partial<CustomerRequest>): RequestProduct[] => {
  if (!request) return [getInitialProduct()];
  const products = Array.isArray(request.products) ? request.products : [];
  if (products.length) {
    return products.map((product) => ({
      ...getInitialProduct(),
      ...product,
      studsPcdMode: product.studsPcdMode ?? 'standard',
      studsPcdStandardSelections: Array.isArray(product.studsPcdStandardSelections) ? product.studsPcdStandardSelections : [],
      studsPcdSpecialText: product.studsPcdSpecialText ?? '',
      productComments: typeof (product as any).productComments === 'string'
        ? (product as any).productComments
        : (product as any).otherRequirements ?? '',
      attachments: Array.isArray(product.attachments) ? product.attachments : [],
    }));
  }
  return [buildLegacyProduct(request)];
};

const getInitialFormData = (): Partial<CustomerRequest> => ({
  clientName: '',
  clientContact: '',
  applicationVehicle: '',
  applicationVehicleOther: '',
  country: '',
  expectedQty: null,
  repeatability: '',
  expectedDeliverySelections: [],
  workingCondition: '',
  workingConditionOther: '',
  usageType: '',
  usageTypeOther: '',
  environment: '',
  environmentOther: '',
  products: [getInitialProduct()],
  status: 'draft',
});

const RequestForm: React.FC = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getRequestById, createRequest, updateRequest, updateStatus, isLoading } = useRequests();
  const { t } = useLanguage();
  const {
    applicationVehicles,
    countries,
    axleLocations,
    articulationTypes,
    configurationTypes,
    brakeTypes,
    brakeSizes,
    suspensions,
    repeatabilityTypes,
    expectedDeliveryOptions,
    workingConditions,
    usageTypes,
    environments,
  } = useAdminSettings();
  const { toast } = useToast();

  const isEditMode = location.pathname.includes('/edit');
  const isViewMode = id && !isEditMode;
  const isCreateMode = !id;

  const existingRequest = id ? getRequestById(id) : undefined;

  const [formData, setFormData] = useState<Partial<CustomerRequest>>(
    existingRequest ? { ...existingRequest, products: normalizeProducts(existingRequest) } : getInitialFormData()
  );
  const [loadedRequestId, setLoadedRequestId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);
  const [designResultComments, setDesignResultComments] = useState('');
  const [designResultAttachments, setDesignResultAttachments] = useState<Attachment[]>([]);
  const [designResultDirty, setDesignResultDirty] = useState(false);
  const submitRedirectRef = useRef<number | null>(null);
  const designResultRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!existingRequest) {
      if (loadedRequestId !== null) {
        setFormData(getInitialFormData());
        setLoadedRequestId(null);
      }
      return;
    }

    if (existingRequest.id !== loadedRequestId) {
      setFormData({ ...existingRequest, products: normalizeProducts(existingRequest) });
      setLoadedRequestId(existingRequest.id);
    }
  }, [existingRequest, loadedRequestId]);

  useEffect(() => {
    if (!existingRequest) {
      setDesignResultComments('');
      setDesignResultAttachments([]);
      setDesignResultDirty(false);
      designResultRequestIdRef.current = null;
      return;
    }

    const requestChanged = designResultRequestIdRef.current !== existingRequest.id;
    if (requestChanged) {
      designResultRequestIdRef.current = existingRequest.id;
      setDesignResultDirty(false);
    }

    if (requestChanged || !designResultDirty) {
      setDesignResultComments(existingRequest.designResultComments ?? '');
      setDesignResultAttachments(
        Array.isArray(existingRequest.designResultAttachments)
          ? existingRequest.designResultAttachments
          : []
      );
    }
  }, [
    existingRequest?.id,
    existingRequest?.designResultComments,
    existingRequest?.designResultAttachments,
    designResultDirty,
  ]);

  // Determine form mode
  const mode: FormMode = useMemo(() => {
    if (isCreateMode) return 'create';
    if (!existingRequest) return 'read_only';
    
    // Admin can always edit (when in edit route)
    if (user?.role === 'admin' && isEditMode) {
      return 'draft_edit';
    }
    
    const canEdit = user?.role === 'sales' && 
      (existingRequest.status === 'draft' || existingRequest.status === 'clarification_needed');
    
    if (!canEdit || isViewMode) return 'read_only';
    
    if (existingRequest.status === 'draft') return 'draft_edit';
    if (existingRequest.status === 'clarification_needed') return 'clarification_edit';
    
    return 'read_only';
  }, [isCreateMode, existingRequest, user, isViewMode, isEditMode]);

  const isReadOnly = mode === 'read_only';
  const isEditable = mode === 'create' || mode === 'draft_edit' || mode === 'clarification_edit';

  const [currentStep, setCurrentStep] = useState<FormStep>(() => (isReadOnly ? 'review' : 'chapters'));
  const [currentProductIndex, setCurrentProductIndex] = useState(0);

  const products = formData.products && formData.products.length
    ? formData.products
    : [getInitialProduct()];

  useEffect(() => {
    if (isReadOnly) {
      setCurrentStep('review');
    }
  }, [isReadOnly]);

  useEffect(() => {
    setCurrentProductIndex((prev) => {
      if (!products.length) return 0;
      return Math.min(prev, Math.max(products.length - 1, 0));
    });
  }, [products.length]);

  useEffect(() => {
    return () => {
      if (submitRedirectRef.current) {
        window.clearTimeout(submitRedirectRef.current);
      }
    };
  }, []);

  // If we have an ID but no request found, redirect to dashboard
  if (id && isLoading && !existingRequest) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        {t.common.loading}
      </div>
    );
  }

  if (id && !existingRequest) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center py-16">
          <h1 className="text-2xl font-bold text-foreground mb-4">{t.request.requestNotFound}</h1>
          <p className="text-muted-foreground mb-6">{t.request.requestNotFoundDesc}</p>
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={16} className="mr-2" />
            {t.request.backToDashboard}
          </Button>
        </div>
      </div>
    );
  }

  if (showSubmitSuccess) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="bg-card/90 border border-primary/20 rounded-2xl p-8 md:p-12 text-center space-y-4 shadow-lg backdrop-blur">
          <div className="mx-auto h-14 w-14 md:h-16 md:w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 md:h-9 md:w-9 text-primary" />
          </div>
          <h2 className="text-lg md:text-2xl font-semibold text-foreground">{t.request.requestSubmitted}</h2>
          <p className="text-sm md:text-base text-muted-foreground">{t.request.requestSubmittedDesc}</p>
          <p className="text-xs md:text-sm text-muted-foreground">{t.request.submissionRedirecting}</p>
        </div>
      </div>
    );
  }

  const handleChange = (field: keyof CustomerRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when field is changed
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleProductChange = (index: number, field: keyof RequestProduct, value: any) => {
    setFormData(prev => {
      const products = [...(prev.products ?? [])];
      while (products.length <= index) {
        products.push(getInitialProduct());
      }
      products[index] = { ...products[index], [field]: value };
      return { ...prev, products };
    });

    const errorKey = `product_${index}_${String(field)}`;
    if (errors[errorKey]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[errorKey];
        return newErrors;
      });
    }
  };

  const handleAddProduct = () => {
    if (isReadOnly) return;
    const sourceProduct = products[currentProductIndex] ?? getInitialProduct();
    const nextProduct = cloneProductForNext(sourceProduct);
    setFormData(prev => ({
      ...prev,
      products: [...(prev.products ?? []), nextProduct],
    }));
    setCurrentProductIndex(products.length);
  };

  const handleRemoveProduct = (index: number) => {
    if (isReadOnly) return;
    const nextLength = Math.max(products.length - 1, 1);
    setFormData(prev => {
      const products = [...(prev.products ?? [])];
      products.splice(index, 1);
      return { ...prev, products: products.length ? products : [getInitialProduct()] };
    });
    setCurrentProductIndex((prevIndex) => {
      if (prevIndex > index) return prevIndex - 1;
      if (prevIndex === index) return Math.min(index, nextLength - 1);
      return prevIndex;
    });
    setErrors(prev => {
      const newErrors: Record<string, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const match = key.match(/^product_(\d+)_(.+)$/);
        if (!match) {
          newErrors[key] = value;
          return;
        }
        const keyIndex = Number(match[1]);
        if (Number.isNaN(keyIndex) || keyIndex === index) {
          return;
        }
        const newIndex = keyIndex > index ? keyIndex - 1 : keyIndex;
        newErrors[`product_${newIndex}_${match[2]}`] = value;
      });
      return newErrors;
    });
  };

  const getProductErrors = (index: number) => {
    const prefix = `product_${index}_`;
    return Object.keys(errors).reduce<Record<string, string>>((acc, key) => {
      if (key.startsWith(prefix)) {
        acc[key.slice(prefix.length)] = errors[key];
      }
      return acc;
    }, {});
  };

  const buildChapterErrors = (): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    if (!formData.clientName?.trim()) {
      newErrors.clientName = t.request.clientName + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.clientContact?.trim()) {
      newErrors.clientContact = t.request.clientContact + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.applicationVehicle?.trim() && formData.applicationVehicle !== 'other') {
      newErrors.applicationVehicle = t.request.applicationVehicle + ' ' + t.common.required.toLowerCase();
    }
    if (formData.applicationVehicle === 'other' && !formData.applicationVehicleOther?.trim()) {
      newErrors.applicationVehicleOther = t.request.specifyVehicle + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.country?.trim()) {
      newErrors.country = t.request.country + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.expectedQty) {
      newErrors.expectedQty = t.request.expectedQty + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.repeatability) {
      newErrors.repeatability = t.request.repeatability + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.expectedDeliverySelections?.length) {
      newErrors.expectedDeliverySelections = t.request.expectedDelivery + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.workingCondition) {
      newErrors.workingCondition = t.request.workingCondition + ' ' + t.common.required.toLowerCase();
    }
    if (formData.workingCondition === 'other' && !formData.workingConditionOther?.trim()) {
      newErrors.workingConditionOther = t.request.specifyWorkingCondition + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.usageType) {
      newErrors.usageType = t.request.usageType + ' ' + t.common.required.toLowerCase();
    }
    if (formData.usageType === 'other' && !formData.usageTypeOther?.trim()) {
      newErrors.usageTypeOther = t.request.specifyUsageType + ' ' + t.common.required.toLowerCase();
    }
    if (!formData.environment) {
      newErrors.environment = t.request.environment + ' ' + t.common.required.toLowerCase();
    }
    if (formData.environment === 'other' && !formData.environmentOther?.trim()) {
      newErrors.environmentOther = t.request.specifyEnvironment + ' ' + t.common.required.toLowerCase();
    }
    return newErrors;
  };

  const buildProductErrors = (product: RequestProduct, index: number): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    const prefix = `product_${index}_`;

    if (!product.axleLocation) {
      newErrors[`${prefix}axleLocation`] = t.request.axleLocation + ' ' + t.common.required.toLowerCase();
    }
    if (product.axleLocation === 'other' && !product.axleLocationOther?.trim()) {
      newErrors[`${prefix}axleLocationOther`] = t.request.specifyAxleLocation + ' ' + t.common.required.toLowerCase();
    }
    if (!product.articulationType) {
      newErrors[`${prefix}articulationType`] = t.request.articulationType + ' ' + t.common.required.toLowerCase();
    }
    if (product.articulationType === 'other' && !product.articulationTypeOther?.trim()) {
      newErrors[`${prefix}articulationTypeOther`] = t.request.specifyArticulationType + ' ' + t.common.required.toLowerCase();
    }
    if (!product.configurationType) {
      newErrors[`${prefix}configurationType`] = t.request.configurationType + ' ' + t.common.required.toLowerCase();
    }
    if (product.configurationType === 'other' && !product.configurationTypeOther?.trim()) {
      newErrors[`${prefix}configurationTypeOther`] = t.request.specifyConfigurationType + ' ' + t.common.required.toLowerCase();
    }
    if (!product.loadsKg) {
      newErrors[`${prefix}loadsKg`] = t.request.loads + ' ' + t.common.required.toLowerCase();
    }
    if (!product.speedsKmh) {
      newErrors[`${prefix}speedsKmh`] = t.request.speeds + ' ' + t.common.required.toLowerCase();
    }
    if (!product.tyreSize?.trim()) {
      newErrors[`${prefix}tyreSize`] = t.request.tyreSize + ' ' + t.common.required.toLowerCase();
    }
    if (!product.trackMm) {
      newErrors[`${prefix}trackMm`] = t.request.track + ' ' + t.common.required.toLowerCase();
    }
    if (!product.brakeType) {
      newErrors[`${prefix}brakeType`] = t.request.brakeType + ' ' + t.common.required.toLowerCase();
    }
    if (!product.brakeSize) {
      newErrors[`${prefix}brakeSize`] = t.request.brakeSize + ' ' + t.common.required.toLowerCase();
    }
    if (!product.suspension?.trim()) {
      newErrors[`${prefix}suspension`] = t.request.suspension + ' ' + t.common.required.toLowerCase();
    }

    if (product.studsPcdMode === 'standard') {
      if (!product.studsPcdStandardSelections?.length) {
        newErrors[`${prefix}studsPcdStandardSelections`] = t.request.standardOptions + ' ' + t.common.required.toLowerCase();
      }
    } else {
      if (!product.studsPcdSpecialText?.trim()) {
        newErrors[`${prefix}studsPcdSpecialText`] = t.request.specialPcd + ' ' + t.common.required.toLowerCase();
      }
    }

    return newErrors;
  };

  const validateChapters = (): boolean => {
    const chapterErrors = buildChapterErrors();
    setErrors(prev => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (!key.startsWith('product_')) {
          delete next[key];
        }
      });
      return { ...next, ...chapterErrors };
    });
    return Object.keys(chapterErrors).length === 0;
  };

  const validateProduct = (index: number): boolean => {
    const product = products[index] ?? getInitialProduct();
    const productErrors = buildProductErrors(product, index);
    const prefix = `product_${index}_`;
    setErrors(prev => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      });
      return { ...next, ...productErrors };
    });
    return Object.keys(productErrors).length === 0;
  };

  const validateForSubmit = (): boolean => {
    const chapterErrors = buildChapterErrors();
    const productErrors = products.reduce<Record<string, string>>((acc, product, index) => ({
      ...acc,
      ...buildProductErrors(product, index),
    }), {});
    const newErrors = { ...chapterErrors, ...productErrors };
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const prepareRequestPayload = (data: Partial<CustomerRequest>): Partial<CustomerRequest> => {
    const products = data.products ?? [];
    if (!products.length) return data;
    const primary = products[0];
    return {
      ...data,
      products,
      axleLocation: primary.axleLocation,
      axleLocationOther: primary.axleLocationOther,
      articulationType: primary.articulationType,
      articulationTypeOther: primary.articulationTypeOther,
      configurationType: primary.configurationType,
      configurationTypeOther: primary.configurationTypeOther,
      loadsKg: primary.loadsKg,
      speedsKmh: primary.speedsKmh,
      tyreSize: primary.tyreSize,
      trackMm: primary.trackMm,
      studsPcdMode: primary.studsPcdMode,
      studsPcdStandardSelections: primary.studsPcdStandardSelections,
      studsPcdSpecialText: primary.studsPcdSpecialText,
      wheelBase: primary.wheelBase,
      finish: primary.finish,
      brakeType: primary.brakeType,
      brakeSize: primary.brakeSize,
      suspension: primary.suspension,
      otherRequirements: primary.productComments,
      attachments: primary.attachments,
    };
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (isCreateMode) {
        const newRequest = await createRequest(
          prepareRequestPayload({
            ...formData as any,
            status: 'draft',
          }) as any
        );
        toast({
          title: t.request.draftSaved,
          description: `${t.dashboard.requests} ${newRequest.id} ${t.request.draftSavedDesc}`,
        });
        navigate(`/requests/${newRequest.id}/edit`);
      } else if (existingRequest) {
        await updateRequest(existingRequest.id, {
          ...prepareRequestPayload(formData),
          historyEvent: 'edited',
        });
        toast({
          title: t.request.draftSaved,
          description: t.request.draftSavedDesc,
        });
      }
    } catch (error) {
      toast({
        title: t.request.error,
        description: t.request.failedSaveDraft,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const showSubmitConfirmation = () => {
    if (submitRedirectRef.current) {
      window.clearTimeout(submitRedirectRef.current);
    }
    setShowSubmitSuccess(true);
    submitRedirectRef.current = window.setTimeout(() => {
      navigate('/dashboard');
    }, 3000);
  };

  const handleSubmit = async () => {
    if (!validateForSubmit()) {
      toast({
        title: t.request.validationError,
        description: t.request.fillRequiredFields,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (isCreateMode) {
        const newRequest = await createRequest(
          prepareRequestPayload({
            ...formData as any,
            status: 'submitted',
          }) as any
        );
        toast({
          title: t.request.requestSubmitted,
          description: `${t.dashboard.requests} ${newRequest.id} ${t.request.requestSubmittedDesc}`,
        });
        showSubmitConfirmation();
      } else if (existingRequest) {
        const isResubmission =
          existingRequest.status === 'draft' || existingRequest.status === 'clarification_needed';

        if (isResubmission) {
          await updateRequest(existingRequest.id, prepareRequestPayload({ ...formData, status: 'submitted' }));
          await updateStatus(existingRequest.id, 'submitted');
          toast({
            title: t.request.requestSubmitted,
            description: t.request.requestSubmittedDesc,
          });
          showSubmitConfirmation();
        } else {
          await updateRequest(existingRequest.id, {
            ...prepareRequestPayload(formData),
            historyEvent: 'edited',
          });
          toast({
            title: t.request.statusUpdated,
            description: t.request.draftSavedDesc,
          });
        }
      }
    } catch (error) {
      toast({
        title: t.request.error,
        description: t.request.failedSubmit,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDesignStatusUpdate = async (status: RequestStatus, data?: { comment?: string; message?: string; date?: Date }) => {
    if (!existingRequest) return;
    
    setIsUpdating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const updates: Partial<CustomerRequest> = {};
      
      if (status === 'clarification_needed' && data?.comment) {
        updates.clarificationComment = data.comment;
      }
      if (status === 'feasibility_confirmed') {
        updates.acceptanceMessage = data?.message;
        updates.expectedDesignReplyDate = data?.date;
      }
      
      await updateRequest(existingRequest.id, updates);
      await updateStatus(existingRequest.id, status, data?.comment || data?.message);
      
      toast({
        title: t.request.statusUpdated,
        description: `${t.common.status}: ${t.statuses[status as keyof typeof t.statuses] || status}`,
      });
    } catch (error) {
      toast({
        title: t.request.error,
        description: t.request.failedSubmit,
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCostingStatusUpdate = async (status: RequestStatus, notes?: string) => {
    if (!existingRequest) return;
    
    setIsUpdating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (notes !== undefined) {
        await updateRequest(existingRequest.id, { costingNotes: notes });
      }
      await updateStatus(existingRequest.id, status);
      
      toast({
        title: t.request.statusUpdated,
        description: `${t.common.status}: ${t.statuses[status as keyof typeof t.statuses] || status}`,
      });
    } catch (error) {
      toast({
        title: t.request.error,
        description: t.request.failedSubmit,
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClarificationResubmit = async (response: string) => {
    if (!existingRequest) return;
    
    setIsSubmitting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await updateRequest(existingRequest.id, {
        ...prepareRequestPayload(formData),
        clarificationResponse: response,
        status: 'submitted',
      });
      await updateStatus(existingRequest.id, 'submitted', `${t.panels.clarificationResponse}: ${response}`);
      
      toast({
        title: t.request.requestSubmitted,
        description: t.request.requestSubmittedDesc,
      });
      showSubmitConfirmation();
    } catch (error) {
      toast({
        title: t.request.error,
        description: t.request.failedSubmit,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAdminEdit = user?.role === 'admin' && isEditMode;
  const showDesignPanel = (user?.role === 'design' || isAdminEdit) && existingRequest &&
    (isAdminEdit || ['submitted', 'under_review', 'feasibility_confirmed', 'design_result'].includes(existingRequest.status));
  
  const showCostingPanel = user?.role === 'costing' && existingRequest &&
    ['feasibility_confirmed', 'design_result', 'in_costing'].includes(existingRequest.status);
  
  const showClarificationPanel = (user?.role === 'sales' || user?.role === 'admin') && 
    existingRequest?.status === 'clarification_needed';
  const canEditDesignResult = Boolean(
    existingRequest && (
      (user?.role === 'design' && ['feasibility_confirmed', 'design_result'].includes(existingRequest.status)) ||
      isAdminEdit
    )
  );

  const handleDesignResultSave = async (payload: { comments: string; attachments: Attachment[] }) => {
    if (!existingRequest) return;
    setIsUpdating(true);
    try {
      await updateRequest(existingRequest.id, {
        designResultComments: payload.comments,
        designResultAttachments: payload.attachments,
      });
      await updateStatus(existingRequest.id, 'design_result');
      setDesignResultDirty(false);
      toast({
        title: t.request.statusUpdated,
        description: t.request.draftSavedDesc,
      });
    } catch (error) {
      toast({
        title: t.request.error,
        description: t.request.failedSubmit,
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const stepIndex = currentStep === 'chapters' ? 0 : currentStep === 'product' ? 1 : 2;
  const progressPercent = stepIndex / 2;
  const productStepLabel = products.length > 1
    ? `${t.request.productsStep} (${Math.min(currentProductIndex + 1, products.length)}/${products.length})`
    : t.request.productsStep;

  const handleNextFromChapters = () => {
    if (!validateChapters()) {
      toast({
        title: t.request.validationError,
        description: t.request.fillRequiredFields,
        variant: 'destructive',
      });
      return;
    }
    setCurrentStep('product');
    setCurrentProductIndex(0);
  };

  const handleBackFromProduct = () => {
    if (currentProductIndex === 0) {
      setCurrentStep('chapters');
      return;
    }
    setCurrentProductIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleNextFromProduct = () => {
    if (!validateProduct(currentProductIndex)) {
      toast({
        title: t.request.validationError,
        description: t.request.fillRequiredFields,
        variant: 'destructive',
      });
      return;
    }
    if (currentProductIndex < products.length - 1) {
      setCurrentProductIndex((prev) => Math.min(prev + 1, products.length - 1));
      return;
    }
    setCurrentStep('review');
  };

  const handleAddAnotherProduct = () => {
    if (!validateProduct(currentProductIndex)) {
      toast({
        title: t.request.validationError,
        description: t.request.fillRequiredFields,
        variant: 'destructive',
      });
      return;
    }
    handleAddProduct();
  };

  const handleBackFromReview = () => {
    setCurrentStep('product');
    setCurrentProductIndex(Math.max(products.length - 1, 0));
  };

  const handleGoToProduct = (index: number) => {
    if (index === currentProductIndex) return;
    setCurrentProductIndex(index);
  };

  const steps = [
    { id: 'chapters', label: t.request.chaptersStep },
    { id: 'product', label: productStepLabel },
    { id: 'review', label: t.request.reviewStep },
  ];

  const stepItems = steps.map((step, index) => ({
    ...step,
    isActive: stepIndex === index,
    isComplete: stepIndex > index,
    index,
  }));

  return (
    <div className="space-y-4 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="shrink-0 hidden md:flex"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <h1 className="text-lg md:text-2xl font-bold text-foreground truncate">
                {isCreateMode ? t.request.newRequest : existingRequest?.id}
              </h1>
              {existingRequest && (
                <StatusBadge status={existingRequest.status} size="lg" />
              )}
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-1">
              {isCreateMode 
                ? t.request.fillDetails
                : isReadOnly 
                  ? t.request.viewDetails 
                  : t.request.editDetails}
            </p>
          </div>
        </div>
      </div>

      {!isReadOnly && (
        <div className="relative bg-card rounded-lg border border-border p-4 md:p-6">
          <div className="relative">
            <div
              className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-muted"
              style={{ left: 'calc(100% / 6)', right: 'calc(100% / 6)' }}
            />
            <div
              className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-primary/80 origin-left transition-transform duration-300"
              style={{
                left: 'calc(100% / 6)',
                right: 'calc(100% / 6)',
                transform: `scaleX(${progressPercent})`,
              }}
            />
            <div className="grid grid-cols-3 items-center relative min-h-[48px]">
              {stepItems.map((step) => (
                <div key={step.id} className="flex items-center justify-center">
                  <span
                    className={[
                      'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                      step.isActive ? 'bg-primary text-primary-foreground border-primary shadow-sm' : '',
                      step.isComplete ? 'bg-card text-primary border-primary shadow-sm' : '',
                      !step.isActive && !step.isComplete ? 'bg-muted text-muted-foreground border-border' : '',
                    ].join(' ')}
                  >
                    {step.index + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {stepItems.map((step) => (
              <span
                key={`${step.id}-label`}
                className={[
                  'text-xs md:text-sm font-medium',
                  step.isActive ? 'text-primary' : '',
                  step.isComplete ? 'text-primary' : '',
                  !step.isActive && !step.isComplete ? 'text-muted-foreground' : '',
                ].join(' ')}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={existingRequest ? "grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8" : "w-full"}>
        {/* Main Form */}
        <div className={existingRequest ? "lg:col-span-2 space-y-4 md:space-y-8" : "space-y-4 md:space-y-8"}>
          {currentStep === 'chapters' && (
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-6 md:space-y-8">
              <SectionGeneralInfo
                formData={formData}
                onChange={handleChange}
                isReadOnly={isReadOnly}
                errors={errors}
                countryOptions={countries.map(c => c.value)}
                repeatabilityOptions={repeatabilityTypes.map((r) => r.value)}
              />

              <SectionExpectedDelivery
                formData={formData}
                onChange={handleChange}
                isReadOnly={isReadOnly}
                errors={errors}
                expectedDeliveryOptions={expectedDeliveryOptions.map((o) => o.value)}
              />
              
              <SectionClientApplication
                formData={formData}
                onChange={handleChange}
                isReadOnly={isReadOnly}
                errors={errors}
                applicationVehicleOptions={applicationVehicles.map(v => v.value)}
                workingConditionOptions={workingConditions.map((c) => c.value)}
                usageTypeOptions={usageTypes.map((u) => u.value)}
                environmentOptions={environments.map((e) => e.value)}
              />
            </div>
          )}

          {currentStep === 'product' && (
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-6 md:space-y-8">
              {(() => {
                const product = products[currentProductIndex] ?? getInitialProduct();
                const productLabel = `${t.request.productLabel} ${currentProductIndex + 1}`;
                const productErrors = getProductErrors(currentProductIndex);

                return (
                  <div className="space-y-4 md:space-y-6">
                    {products.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {products.map((_, index) => (
                          <Button
                            key={`product-tab-${index}`}
                            type="button"
                            variant={index === currentProductIndex ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleGoToProduct(index)}
                          >
                            {t.request.productLabel} {index + 1}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{productLabel}</p>
                      {!isReadOnly && products.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveProduct(currentProductIndex)}
                        >
                          {t.request.removeProduct}
                        </Button>
                      )}
                    </div>

                    <SectionTechnicalInfo
                      formData={product}
                      onChange={(field, value) => handleProductChange(currentProductIndex, field, value)}
                      isReadOnly={isReadOnly}
                      errors={productErrors}
                      configurationTypeOptions={configurationTypes.map((c) => c.value)}
                      axleLocationOptions={axleLocations.map((a) => a.value)}
                      articulationTypeOptions={articulationTypes.map((a) => a.value)}
                      brakeTypeOptions={brakeTypes.map((b) => b.value)}
                      brakeSizeOptions={brakeSizes.map((b) => b.value)}
                      suspensionOptions={suspensions.map((s) => s.value)}
                      title={`${t.request.technicalInfo} - ${productLabel}`}
                      badgeLabel={`P${currentProductIndex + 1}`}
                      idPrefix={`product-${currentProductIndex}`}
                    />

                    <SectionAdditionalInfo
                      formData={product}
                      onChange={(field, value) => handleProductChange(currentProductIndex, field, value)}
                      isReadOnly={isReadOnly}
                      errors={productErrors}
                      title={`${t.request.additionalInfo} - ${productLabel}`}
                      badgeLabel={`P${currentProductIndex + 1}`}
                      idPrefix={`product-${currentProductIndex}`}
                    />
                  </div>
                );
              })()}
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-4 md:space-y-8">
              <div className="bg-card rounded-lg border border-border p-4 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base md:text-lg font-semibold text-foreground">{t.request.reviewSummaryTitle}</h2>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">{t.request.reviewSummaryDesc}</p>
                  </div>
                  {isEditable && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentStep('chapters')}
                      >
                        {t.request.editChapters}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentStep('product');
                          setCurrentProductIndex(0);
                        }}
                      >
                        {t.request.editProducts}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-6 md:space-y-8">
                <SectionGeneralInfo
                  formData={formData}
                  onChange={handleChange}
                  isReadOnly={true}
                  errors={{}}
                  countryOptions={countries.map(c => c.value)}
                  repeatabilityOptions={repeatabilityTypes.map((r) => r.value)}
                />

                <SectionExpectedDelivery
                  formData={formData}
                  onChange={handleChange}
                  isReadOnly={true}
                  errors={{}}
                  expectedDeliveryOptions={expectedDeliveryOptions.map((o) => o.value)}
                />
                
                <SectionClientApplication
                  formData={formData}
                  onChange={handleChange}
                  isReadOnly={true}
                  errors={{}}
                  applicationVehicleOptions={applicationVehicles.map(v => v.value)}
                  workingConditionOptions={workingConditions.map((c) => c.value)}
                  usageTypeOptions={usageTypes.map((u) => u.value)}
                  environmentOptions={environments.map((e) => e.value)}
                />
              </div>

              {products.map((product, index) => {
                const productLabel = `${t.request.productLabel} ${index + 1}`;
                return (
                  <div key={`review-product-${index}`} className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4 md:space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{productLabel}</p>
                      {isEditable && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCurrentStep('product');
                            setCurrentProductIndex(index);
                          }}
                        >
                          {t.common.edit}
                        </Button>
                      )}
                    </div>
                    <SectionTechnicalInfo
                      formData={product}
                      onChange={(field, value) => handleProductChange(index, field, value)}
                      isReadOnly={true}
                      errors={{}}
                      configurationTypeOptions={configurationTypes.map((c) => c.value)}
                      axleLocationOptions={axleLocations.map((a) => a.value)}
                      articulationTypeOptions={articulationTypes.map((a) => a.value)}
                      brakeTypeOptions={brakeTypes.map((b) => b.value)}
                      brakeSizeOptions={brakeSizes.map((b) => b.value)}
                      suspensionOptions={suspensions.map((s) => s.value)}
                      title={`${t.request.technicalInfo} - ${productLabel}`}
                      badgeLabel={`P${index + 1}`}
                      idPrefix={`review-product-${index}`}
                    />

                    <SectionAdditionalInfo
                      formData={product}
                      onChange={(field, value) => handleProductChange(index, field, value)}
                      isReadOnly={true}
                      errors={{}}
                      title={`${t.request.additionalInfo} - ${productLabel}`}
                      badgeLabel={`P${index + 1}`}
                      idPrefix={`review-product-${index}`}
                    />
                  </div>
                );
              })}

            </div>
          )}

          {/* Role-specific panels */}
          {showClarificationPanel && existingRequest && (
            <ClarificationPanel
              request={existingRequest}
              onResubmit={handleClarificationResubmit}
              isSubmitting={isSubmitting}
            />
          )}

          {existingRequest && (
            <DesignReviewPanel
              request={existingRequest}
              onUpdateStatus={handleDesignStatusUpdate}
              isUpdating={isUpdating}
              showActions={showDesignPanel}
              forceEnableActions={isAdminEdit}
            />
          )}

          {existingRequest && (user?.role === 'design' || isAdminEdit) && (
            <div className="bg-card rounded-lg border border-border p-6 space-y-4">
              <DesignResultSection
                comments={canEditDesignResult ? designResultComments : (existingRequest.designResultComments ?? '')}
                attachments={canEditDesignResult
                  ? designResultAttachments
                  : Array.isArray(existingRequest.designResultAttachments)
                    ? existingRequest.designResultAttachments
                    : []}
                onCommentsChange={canEditDesignResult ? (value) => {
                  setDesignResultComments(value);
                  setDesignResultDirty(true);
                } : undefined}
                onAttachmentsChange={canEditDesignResult ? (files) => {
                  setDesignResultAttachments(files);
                  setDesignResultDirty(true);
                } : undefined}
                isReadOnly={!canEditDesignResult}
                showEmptyState={true}
              />
              {canEditDesignResult && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => handleDesignResultSave({
                      comments: designResultComments,
                      attachments: designResultAttachments,
                    })}
                    disabled={isUpdating}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
                    {t.panels.saveDesignResult}
                  </Button>
                </div>
              )}
            </div>
          )}

          {existingRequest && user?.role !== 'design' && !isAdminEdit && (
            <div className="bg-card rounded-lg border border-border p-4 md:p-6">
              <DesignResultSection
                comments={existingRequest.designResultComments ?? ''}
                attachments={Array.isArray(existingRequest.designResultAttachments)
                  ? existingRequest.designResultAttachments
                  : []}
                isReadOnly={true}
                showEmptyState={true}
              />
            </div>
          )}

          {showCostingPanel && existingRequest && (
            <CostingPanel
              request={existingRequest}
              onUpdateStatus={handleCostingStatusUpdate}
              onUpdateCostingData={async (data) => {
                await updateRequest(existingRequest.id, data);
              }}
              isUpdating={isUpdating}
            />
          )}
        </div>

        {/* Sidebar - only show for existing requests */}
        {existingRequest && (
          <div className="space-y-4 md:space-y-6">
            <StatusTimeline history={existingRequest.history} />
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="fixed md:sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border py-3 md:py-4 px-3 md:px-6 z-50 md:-mx-6 md:mt-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="md:hidden"
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="hidden md:inline-flex"
          >
            <ArrowLeft size={16} className="mr-2" />
            {t.request.backToDashboard}
          </Button>

          {isEditable && (
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={isSaving || isSubmitting}
                className="md:hidden"
                aria-label={t.request.saveDraft}
              >
                <Save size={16} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={isSaving || isSubmitting}
                className="hidden md:inline-flex"
              >
                <Save size={16} className="mr-2" />
                {isSaving ? t.request.saving : t.request.saveDraft}
              </Button>

              {currentStep === 'chapters' && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleNextFromChapters}
                  disabled={isSaving || isSubmitting}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {t.common.next}
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              )}

              {currentStep === 'product' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBackFromProduct}
                    disabled={isSaving || isSubmitting}
                  >
                    <ArrowLeft size={16} className="mr-2" />
                    {t.common.back}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddAnotherProduct}
                    disabled={isSaving || isSubmitting}
                  >
                    {t.request.addAnotherProduct}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleNextFromProduct}
                    disabled={isSaving || isSubmitting}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {currentProductIndex < products.length - 1 ? t.request.nextProduct : t.request.reviewAndSubmit}
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </>
              )}

              {currentStep === 'review' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBackFromReview}
                    disabled={isSaving || isSubmitting}
                  >
                    <ArrowLeft size={16} className="mr-2" />
                    {t.common.back}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={isSubmitting || isSaving}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {isSubmitting ? t.request.submitting : t.request.submitRequest}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestForm;
