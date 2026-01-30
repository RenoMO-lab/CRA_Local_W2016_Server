import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequestProduct, BrakeType } from '@/types';
import StudsPcdBlock from './StudsPcdBlock';
import { useLanguage } from '@/context/LanguageContext';

interface SectionTechnicalInfoProps {
  formData: Partial<RequestProduct>;
  onChange: (field: keyof RequestProduct, value: any) => void;
  isReadOnly: boolean;
  errors?: Record<string, string>;
  repeatabilityValue?: string;
  onRepeatabilityChange?: (value: string) => void;
  repeatabilityOptions?: string[];
  repeatabilityError?: string;
  configurationTypeOptions?: string[];
  axleLocationOptions?: string[];
  articulationTypeOptions?: string[];
  brakeTypeOptions?: string[];
  brakeSizeOptions?: string[];
  brakePowerTypeOptions?: string[];
  brakeCertificateOptions?: string[];
  mainBodySectionTypeOptions?: string[];
  clientSealingRequestOptions?: string[];
  cupLogoOptions?: string[];
  suspensionOptions?: string[];
  title?: string;
  badgeLabel?: string;
  idPrefix?: string;
}

const SectionTechnicalInfo: React.FC<SectionTechnicalInfoProps> = ({
  formData,
  onChange,
  isReadOnly,
  errors = {},
  configurationTypeOptions = [],
  axleLocationOptions = [],
  articulationTypeOptions = [],
  repeatabilityValue = '',
  onRepeatabilityChange,
  repeatabilityOptions = [],
  repeatabilityError,
  brakeTypeOptions = [],
  brakeSizeOptions = [],
  brakePowerTypeOptions = [],
  brakeCertificateOptions = [],
  mainBodySectionTypeOptions = [],
  clientSealingRequestOptions = [],
  cupLogoOptions = [],
  suspensionOptions = [],
  title,
  badgeLabel,
  idPrefix,
}) => {
  const { t, translateOption } = useLanguage();
  const fieldId = (suffix: string) => (idPrefix ? `${idPrefix}-${suffix}` : suffix);
  const showConfigurationTypeOther = formData.configurationType === 'other';
  const showAxleLocationOther = formData.axleLocation === 'other';
  const showArticulationTypeOther = formData.articulationType === 'other';
  const articulationValue = (formData.articulationType ?? '').toString().toLowerCase();
  const showWheelBase = articulationValue.includes('steering');
  const brakeTypeValue = String(formData.brakeType ?? '').toLowerCase();
  const isBrakeNA = brakeTypeValue === 'na' || brakeTypeValue === 'n/a' || brakeTypeValue === 'n.a';

  const hasRepeatabilityOptions = repeatabilityOptions.length > 0;
  const hasConfigurationOptions = configurationTypeOptions.length > 0;
  const hasAxleLocationOptions = axleLocationOptions.length > 0;
  const hasArticulationOptions = articulationTypeOptions.length > 0;
  const hasBrakeTypeOptions = brakeTypeOptions.length > 0;
  const hasBrakeSizeOptions = brakeSizeOptions.length > 0;
  const hasBrakePowerTypeOptions = brakePowerTypeOptions.length > 0;
  const hasBrakeCertificateOptions = brakeCertificateOptions.length > 0;
  const hasMainBodySectionTypeOptions = mainBodySectionTypeOptions.length > 0;
  const hasClientSealingRequestOptions = clientSealingRequestOptions.length > 0;
  const hasCupLogoOptions = cupLogoOptions.length > 0;
  const hasSuspensionOptions = suspensionOptions.length > 0;

  const normalizeBrakeType = (raw: string): BrakeType => {
    const v = raw.trim().toLowerCase();
    if (v === 'drum') return 'drum';
    if (v === 'disk' || v === 'disc') return 'disk';
    if (v === 'n/a' || v === 'na' || v === 'n.a') return 'na';
    return 'na';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <h3 className="section-title flex items-center gap-2 text-base md:text-lg">
        <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs md:text-sm font-bold shrink-0">
          {badgeLabel ?? '4'}
        </span>
        {title ?? t.request.technicalInfo}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        {/* Repeatability */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('repeatability')} className="text-sm font-medium">
            {t.request.repeatability} <span className="text-destructive">*</span>
          </Label>
          {hasRepeatabilityOptions ? (
            <Select
              value={repeatabilityValue || ''}
              onValueChange={(value) => onRepeatabilityChange?.(value)}
              disabled={isReadOnly}
            >
              <SelectTrigger className={repeatabilityError ? 'border-destructive' : ''}>
                <SelectValue placeholder={t.request.selectRepeatability} />
              </SelectTrigger>
              <SelectContent className="z-50 bg-card border border-border">
                {repeatabilityOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateOption(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId('repeatability')}
              value={repeatabilityValue || ''}
              onChange={(e) => onRepeatabilityChange?.(e.target.value)}
              placeholder={t.request.selectRepeatability}
              disabled={isReadOnly}
              className={repeatabilityError ? 'border-destructive' : ''}
            />
          )}
          {repeatabilityError && (
            <p className="text-xs text-destructive">{repeatabilityError}</p>
          )}
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('quantity')} className="text-sm font-medium">
            {t.request.quantity} <span className="text-destructive">*</span>
          </Label>
          <Input
            id={fieldId('quantity')}
            type="number"
            min="0"
            value={formData.quantity ?? ''}
            onChange={(e) => onChange('quantity', e.target.value ? parseInt(e.target.value) : null)}
            placeholder={t.request.quantityExample}
            disabled={isReadOnly}
            className={errors.quantity ? 'border-destructive' : ''}
          />
          {errors.quantity && (
            <p className="text-xs text-destructive">{errors.quantity}</p>
          )}
        </div>
      </div>
      
      {/* Product Type Section - 3 Sub-fields (Configuration Type first) */}
      <div className="bg-muted/30 rounded-lg p-3 md:p-4 border border-border/50">
        <h4 className="text-sm font-semibold text-foreground mb-3 md:mb-4">{t.request.productType}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {/* Configuration Type (FIRST) */}
          <div className="space-y-2">
            <Label htmlFor={fieldId('configurationType')} className="text-sm font-medium">
              {t.request.configurationType} <span className="text-destructive">*</span>
            </Label>
            {hasConfigurationOptions ? (
              <Select
                value={formData.configurationType || ''}
                onValueChange={(value) => {
                  onChange('configurationType', value);
                  if (value !== 'other') {
                    onChange('configurationTypeOther', '');
                  }
                }}
                disabled={isReadOnly}
              >
                <SelectTrigger className={errors.configurationType ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t.request.selectConfigurationType} />
                </SelectTrigger>
                <SelectContent className="z-50 bg-card border border-border">
                  {configurationTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {translateOption(type)}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">{t.common.other}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={fieldId('configurationType')}
                value={formData.configurationType || ''}
                onChange={(e) => onChange('configurationType', e.target.value)}
                placeholder={t.request.specifyConfigurationType}
                disabled={isReadOnly}
                className={errors.configurationType ? 'border-destructive' : ''}
              />
            )}
            {errors.configurationType && (
              <p className="text-xs text-destructive">{errors.configurationType}</p>
            )}
          </div>

          {/* Configuration Type Other */}
          {showConfigurationTypeOther && hasConfigurationOptions && (
            <div className="space-y-2">
              <Label htmlFor={fieldId('configurationTypeOther')} className="text-sm font-medium">
                {t.request.specifyConfigurationType} <span className="text-destructive">*</span>
              </Label>
              <Input
                id={fieldId('configurationTypeOther')}
                value={formData.configurationTypeOther || ''}
                onChange={(e) => onChange('configurationTypeOther', e.target.value)}
                placeholder={t.request.specifyConfigurationType}
                disabled={isReadOnly}
                className={errors.configurationTypeOther ? 'border-destructive' : ''}
              />
              {errors.configurationTypeOther && (
                <p className="text-xs text-destructive">{errors.configurationTypeOther}</p>
              )}
            </div>
          )}

          {/* Axle Location */}
          <div className="space-y-2">
            <Label htmlFor={fieldId('axleLocation')} className="text-sm font-medium">
              {t.request.axleLocation} <span className="text-destructive">*</span>
            </Label>
            {hasAxleLocationOptions ? (
              <Select
                value={formData.axleLocation || ''}
                onValueChange={(value) => {
                  onChange('axleLocation', value);
                  if (value !== 'other') {
                    onChange('axleLocationOther', '');
                  }
                }}
                disabled={isReadOnly}
              >
                <SelectTrigger className={errors.axleLocation ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t.request.selectAxleLocation} />
                </SelectTrigger>
                 <SelectContent className="z-50 bg-card border border-border">
                  {axleLocationOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {translateOption(type)}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">{t.common.other}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={fieldId('axleLocation')}
                value={formData.axleLocation || ''}
                onChange={(e) => onChange('axleLocation', e.target.value)}
                placeholder={t.request.specifyAxleLocation}
                disabled={isReadOnly}
                className={errors.axleLocation ? 'border-destructive' : ''}
              />
            )}
            {errors.axleLocation && (
              <p className="text-xs text-destructive">{errors.axleLocation}</p>
            )}
          </div>

          {/* Axle Location Other */}
          {showAxleLocationOther && hasAxleLocationOptions && (
            <div className="space-y-2">
              <Label htmlFor={fieldId('axleLocationOther')} className="text-sm font-medium">
                {t.request.specifyAxleLocation} <span className="text-destructive">*</span>
              </Label>
              <Input
                id={fieldId('axleLocationOther')}
                value={formData.axleLocationOther || ''}
                onChange={(e) => onChange('axleLocationOther', e.target.value)}
                placeholder={t.request.specifyAxleLocation}
                disabled={isReadOnly}
                className={errors.axleLocationOther ? 'border-destructive' : ''}
              />
              {errors.axleLocationOther && (
                <p className="text-xs text-destructive">{errors.axleLocationOther}</p>
              )}
            </div>
          )}

          {/* Articulation Type */}
          <div className="space-y-2">
            <Label htmlFor={fieldId('articulationType')} className="text-sm font-medium">
              {t.request.articulationType} <span className="text-destructive">*</span>
            </Label>
            {hasArticulationOptions ? (
              <Select
                value={formData.articulationType || ''}
                onValueChange={(value) => {
                  onChange('articulationType', value);
                  if (value !== 'other') {
                    onChange('articulationTypeOther', '');
                  }
                }}
                disabled={isReadOnly}
              >
                <SelectTrigger className={errors.articulationType ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t.request.selectArticulationType} />
                </SelectTrigger>
                <SelectContent className="z-50 bg-card border border-border">
                  {articulationTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {translateOption(type)}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">{t.common.other}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={fieldId('articulationType')}
                value={formData.articulationType || ''}
                onChange={(e) => onChange('articulationType', e.target.value)}
                placeholder={t.request.specifyArticulationType}
                disabled={isReadOnly}
                className={errors.articulationType ? 'border-destructive' : ''}
              />
            )}
            {errors.articulationType && (
              <p className="text-xs text-destructive">{errors.articulationType}</p>
            )}
          </div>

          {/* Articulation Type Other */}
          {showArticulationTypeOther && hasArticulationOptions && (
            <div className="space-y-2">
              <Label htmlFor={fieldId('articulationTypeOther')} className="text-sm font-medium">
                {t.request.specifyArticulationType} <span className="text-destructive">*</span>
              </Label>
              <Input
                id={fieldId('articulationTypeOther')}
                value={formData.articulationTypeOther || ''}
                onChange={(e) => onChange('articulationTypeOther', e.target.value)}
                placeholder={t.request.specifyArticulationType}
                disabled={isReadOnly}
                className={errors.articulationTypeOther ? 'border-destructive' : ''}
              />
              {errors.articulationTypeOther && (
                <p className="text-xs text-destructive">{errors.articulationTypeOther}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Loads */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('loadsKg')} className="text-sm font-medium">
            {t.request.loads} (kg) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={fieldId('loadsKg')}
            type="number"
            value={formData.loadsKg || ''}
            onChange={(e) => onChange('loadsKg', e.target.value ? parseInt(e.target.value) : null)}
            placeholder={t.request.loadsExample}
            disabled={isReadOnly}
            className={errors.loadsKg ? 'border-destructive' : ''}
          />
          {errors.loadsKg && (
            <p className="text-xs text-destructive">{errors.loadsKg}</p>
          )}
        </div>

        {/* Speeds */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('speedsKmh')} className="text-sm font-medium">
            {t.request.speeds} (km/h) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={fieldId('speedsKmh')}
            type="number"
            value={formData.speedsKmh || ''}
            onChange={(e) => onChange('speedsKmh', e.target.value ? parseInt(e.target.value) : null)}
            placeholder={t.request.speedsExample}
            disabled={isReadOnly}
            className={errors.speedsKmh ? 'border-destructive' : ''}
          />
          {errors.speedsKmh && (
            <p className="text-xs text-destructive">{errors.speedsKmh}</p>
          )}
        </div>

        {/* Tyre Size */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('tyreSize')} className="text-sm font-medium">
            {t.request.tyreSize} <span className="text-destructive">*</span>
          </Label>
          <Input
            id={fieldId('tyreSize')}
            value={formData.tyreSize || ''}
            onChange={(e) => onChange('tyreSize', e.target.value)}
            placeholder={t.request.tyreSizeExample}
            disabled={isReadOnly}
            className={errors.tyreSize ? 'border-destructive' : ''}
          />
          {errors.tyreSize && (
            <p className="text-xs text-destructive">{errors.tyreSize}</p>
          )}
        </div>

        {/* Track */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('trackMm')} className="text-sm font-medium">
            {t.request.track} (mm) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={fieldId('trackMm')}
            type="number"
            value={formData.trackMm || ''}
            onChange={(e) => onChange('trackMm', e.target.value ? parseInt(e.target.value) : null)}
            placeholder={t.request.trackExample}
            disabled={isReadOnly}
            className={errors.trackMm ? 'border-destructive' : ''}
          />
          {errors.trackMm && (
            <p className="text-xs text-destructive">{errors.trackMm}</p>
          )}
        </div>

      </div>

      {/* Studs/PCD Block */}
      <StudsPcdBlock
        formData={formData}
        onChange={onChange}
        isReadOnly={isReadOnly}
        errors={errors}
        idPrefix={idPrefix ? `${idPrefix}-studsPcd` : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Wheel Base */}
        {showWheelBase && (
          <div className="space-y-2">
            <Label htmlFor={fieldId('wheelBase')} className="text-sm font-medium">
              {t.request.wheelBase} (mm)
            </Label>
            <Input
              id={fieldId('wheelBase')}
              value={formData.wheelBase || ''}
              onChange={(e) => onChange('wheelBase', e.target.value)}
              placeholder={t.request.steeringAxleParam}
              disabled={isReadOnly}
            />
            <p className="text-xs text-muted-foreground">{t.request.steeringAxleParam}</p>
          </div>
        )}

        {/* Finish */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('finish')} className="text-sm font-medium">
            {t.request.finish}
          </Label>
          <Input
            id={fieldId('finish')}
            value={formData.finish || t.request.blackPrimerDefault}
            onChange={(e) => onChange('finish', e.target.value)}
            placeholder={t.request.blackPrimerDefault}
            disabled={isReadOnly}
          />
        </div>

        {/* Brake Type */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('brakeType')} className="text-sm font-medium">
            {t.request.brakeType} <span className="text-destructive">*</span>
          </Label>
          {hasBrakeTypeOptions ? (
            <Select
              value={(formData.brakeType as any) || ''}
              onValueChange={(value) => {
                onChange('brakeType', value as BrakeType);
                if (String(value).toLowerCase() === 'na') {
                  onChange('brakeSize', '');
                }
              }}
              disabled={isReadOnly}
            >
              <SelectTrigger className={errors.brakeType ? 'border-destructive' : ''}>
                <SelectValue placeholder={t.request.selectBrakeType} />
              </SelectTrigger>
              <SelectContent className="z-50 bg-card border border-border">
                {brakeTypeOptions.map((label) => {
                  const value = normalizeBrakeType(label);
                  return (
                    <SelectItem key={label} value={value}>
                      {translateOption(label)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={formData.brakeType || ''}
              onValueChange={(value) => {
                onChange('brakeType', value as BrakeType);
                if (String(value).toLowerCase() === 'na') {
                  onChange('brakeSize', '');
                }
              }}
              disabled={isReadOnly}
            >
              <SelectTrigger className={errors.brakeType ? 'border-destructive' : ''}>
                <SelectValue placeholder={t.request.selectBrakeType} />
              </SelectTrigger>
              <SelectContent className="z-50 bg-card border border-border">
                <SelectItem value="drum">{t.request.drum}</SelectItem>
                <SelectItem value="disk">{t.request.disk}</SelectItem>
                <SelectItem value="na">{t.request.na}</SelectItem>
              </SelectContent>
            </Select>
          )}
          {errors.brakeType && (
            <p className="text-xs text-destructive">{errors.brakeType}</p>
          )}
        </div>

        {/* Brake Size */}
        {!isBrakeNA && (
          <div className="space-y-2">
            <Label htmlFor={fieldId('brakeSize')} className="text-sm font-medium">
              {t.request.brakeSize} <span className="text-destructive">*</span>
            </Label>
            {hasBrakeSizeOptions ? (
              <Select
                value={formData.brakeSize || ''}
                onValueChange={(value) => onChange('brakeSize', value)}
                disabled={isReadOnly}
              >
                <SelectTrigger className={errors.brakeSize ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t.request.selectBrakeSize} />
                </SelectTrigger>
                  <SelectContent className="z-50 bg-card border border-border">
                  {brakeSizeOptions.map((size) => (
                    <SelectItem key={size} value={size}>
                      {translateOption(size)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={fieldId('brakeSize')}
                value={formData.brakeSize || ''}
                onChange={(e) => onChange('brakeSize', e.target.value)}
                placeholder={t.request.selectBrakeSize}
                disabled={isReadOnly}
                className={errors.brakeSize ? 'border-destructive' : ''}
              />
            )}
            {errors.brakeSize && (
              <p className="text-xs text-destructive">{errors.brakeSize}</p>
            )}
          </div>
        )}

        {/* Brake Power Type */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('brakePowerType')} className="text-sm font-medium">
            {t.request.brakePowerType}
          </Label>
          {hasBrakePowerTypeOptions ? (
            <Select
              value={formData.brakePowerType || ''}
              onValueChange={(value) => onChange('brakePowerType', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.request.selectBrakePowerType} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                {brakePowerTypeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateOption(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId('brakePowerType')}
              value={formData.brakePowerType || ''}
              onChange={(e) => onChange('brakePowerType', e.target.value)}
              placeholder={t.request.selectBrakePowerType}
              disabled={isReadOnly}
            />
          )}
        </div>

        {/* Brake Certificate */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('brakeCertificate')} className="text-sm font-medium">
            {t.request.brakeCertificate}
          </Label>
          {hasBrakeCertificateOptions ? (
            <Select
              value={formData.brakeCertificate || ''}
              onValueChange={(value) => onChange('brakeCertificate', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.request.selectBrakeCertificate} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                {brakeCertificateOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateOption(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId('brakeCertificate')}
              value={formData.brakeCertificate || ''}
              onChange={(e) => onChange('brakeCertificate', e.target.value)}
              placeholder={t.request.selectBrakeCertificate}
              disabled={isReadOnly}
            />
          )}
        </div>

        {/* Main Body Section Type */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('mainBodySectionType')} className="text-sm font-medium">
            {t.request.mainBodySectionType}
          </Label>
          {hasMainBodySectionTypeOptions ? (
            <Select
              value={formData.mainBodySectionType || ''}
              onValueChange={(value) => onChange('mainBodySectionType', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.request.selectMainBodySectionType} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                {mainBodySectionTypeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateOption(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId('mainBodySectionType')}
              value={formData.mainBodySectionType || ''}
              onChange={(e) => onChange('mainBodySectionType', e.target.value)}
              placeholder={t.request.selectMainBodySectionType}
              disabled={isReadOnly}
            />
          )}
        </div>

        {/* Client Sealing Request */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('clientSealingRequest')} className="text-sm font-medium">
            {t.request.clientSealingRequest}
          </Label>
          {hasClientSealingRequestOptions ? (
            <Select
              value={formData.clientSealingRequest || ''}
              onValueChange={(value) => onChange('clientSealingRequest', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.request.selectClientSealingRequest} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                {clientSealingRequestOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateOption(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId('clientSealingRequest')}
              value={formData.clientSealingRequest || ''}
              onChange={(e) => onChange('clientSealingRequest', e.target.value)}
              placeholder={t.request.selectClientSealingRequest}
              disabled={isReadOnly}
            />
          )}
        </div>

        {/* Cup Logo */}
        <div className="space-y-2">
          <Label htmlFor={fieldId('cupLogo')} className="text-sm font-medium">
            {t.request.cupLogo}
          </Label>
          {hasCupLogoOptions ? (
            <Select
              value={formData.cupLogo || ''}
              onValueChange={(value) => onChange('cupLogo', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.request.selectCupLogo} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                {cupLogoOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateOption(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId('cupLogo')}
              value={formData.cupLogo || ''}
              onChange={(e) => onChange('cupLogo', e.target.value)}
              placeholder={t.request.selectCupLogo}
              disabled={isReadOnly}
            />
          )}
        </div>

        {/* Suspension */}
        <div className="lg:col-span-2 space-y-2">
          <Label htmlFor={fieldId('suspension')} className="text-sm font-medium">
            {t.request.suspension} <span className="text-destructive">*</span>
          </Label>
          {hasSuspensionOptions ? (
            <Select
              value={formData.suspension || ''}
              onValueChange={(value) => onChange('suspension', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger className={errors.suspension ? 'border-destructive' : ''}>
                <SelectValue placeholder={t.request.selectSuspension} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                {suspensionOptions.map((suspension) => (
                  <SelectItem key={suspension} value={suspension}>
                    {translateOption(suspension)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={fieldId('suspension')}
              value={formData.suspension || ''}
              onChange={(e) => onChange('suspension', e.target.value)}
              placeholder={t.request.selectSuspension}
              disabled={isReadOnly}
              className={errors.suspension ? 'border-destructive' : ''}
            />
          )}
          {errors.suspension && (
            <p className="text-xs text-destructive">{errors.suspension}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectionTechnicalInfo;
