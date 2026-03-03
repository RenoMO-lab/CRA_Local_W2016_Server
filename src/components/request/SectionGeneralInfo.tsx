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
import { CustomerRequest } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface SectionGeneralInfoProps {
  formData: Partial<CustomerRequest>;
  onChange: (field: keyof CustomerRequest, value: any) => void;
  isReadOnly: boolean;
  errors?: Record<string, string>;
  countryOptions?: string[];
}

const SectionGeneralInfo: React.FC<SectionGeneralInfoProps> = ({
  formData,
  onChange,
  isReadOnly,
  errors = {},
  countryOptions = [],
}) => {
  const { t, translateOption } = useLanguage();
  const showCountryOther = formData.country === 'other';
  const showCity = formData.country === 'China';
  const showIncotermOther = String(formData.incoterm ?? '').trim().toLowerCase() === 'other';
  const hasCountryOptions = countryOptions.length > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <h3 className="section-title flex items-center gap-2 text-base md:text-lg">
        <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs md:text-sm font-bold shrink-0">1</span>
        {t.request.generalInfo}
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Client Name */}
        <div className="space-y-2">
          <Label htmlFor="clientName" className="text-sm font-medium">
            {t.request.clientName} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="clientName"
            value={formData.clientName || ''}
            onChange={(e) => onChange('clientName', e.target.value)}
            placeholder={t.request.enterClientName}
            disabled={isReadOnly}
            className={errors.clientName ? 'border-destructive' : ''}
          />
          {errors.clientName && (
            <p className="text-xs text-destructive">{errors.clientName}</p>
          )}
        </div>

        {/* Client Contact */}
        <div className="space-y-2">
          <Label htmlFor="clientContact" className="text-sm font-medium">
            {t.request.clientContact} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="clientContact"
            value={formData.clientContact || ''}
            onChange={(e) => onChange('clientContact', e.target.value)}
            placeholder={t.request.enterClientContact}
            disabled={isReadOnly}
            className={errors.clientContact ? 'border-destructive' : ''}
          />
          {errors.clientContact && (
            <p className="text-xs text-destructive">{errors.clientContact}</p>
          )}
        </div>

        {/* Currency */}
        <div className="space-y-2">
          <Label htmlFor="sellingCurrency" className="text-sm font-medium">
            {t.panels.currency} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.sellingCurrency || ''}
            onValueChange={(value) => onChange('sellingCurrency', value as 'USD' | 'EUR' | 'RMB')}
            disabled={isReadOnly}
          >
            <SelectTrigger className={errors.sellingCurrency ? 'border-destructive' : ''}>
              <SelectValue placeholder={t.panels.selectCurrency} />
            </SelectTrigger>
            <SelectContent className="z-50 bg-card border border-border">
              <SelectItem value="USD">{t.panels.currencyUsd}</SelectItem>
              <SelectItem value="EUR">{t.panels.currencyEur}</SelectItem>
              <SelectItem value="RMB">{t.panels.currencyRmb}</SelectItem>
            </SelectContent>
          </Select>
          {errors.sellingCurrency && (
            <p className="text-xs text-destructive">{errors.sellingCurrency}</p>
          )}
        </div>

        {/* Incoterm */}
        <div className="space-y-2">
          <Label htmlFor="incoterm" className="text-sm font-medium">
            {t.panels.incoterm} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.incoterm || ''}
            onValueChange={(value) => {
              onChange('incoterm', value);
              if (value !== 'other') {
                onChange('incotermOther', '');
              }
            }}
            disabled={isReadOnly}
          >
            <SelectTrigger className={errors.incoterm ? 'border-destructive' : ''}>
              <SelectValue placeholder={t.panels.selectIncoterm} />
            </SelectTrigger>
            <SelectContent className="z-50 bg-card border border-border">
              <SelectItem value="EXW">EXW</SelectItem>
              <SelectItem value="FOB">FOB</SelectItem>
              <SelectItem value="other">{t.common.other}</SelectItem>
            </SelectContent>
          </Select>
          {errors.incoterm && (
            <p className="text-xs text-destructive">{errors.incoterm}</p>
          )}
        </div>

        {/* Taxation */}
        <div className="space-y-2">
          <Label htmlFor="vatMode" className="text-sm font-medium">
            {t.panels.vatMode} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.vatMode || ''}
            onValueChange={(value) => onChange('vatMode', value as 'with' | 'without')}
            disabled={isReadOnly}
          >
            <SelectTrigger className={errors.vatMode ? 'border-destructive' : ''}>
              <SelectValue placeholder={t.panels.selectVatMode} />
            </SelectTrigger>
            <SelectContent className="z-50 bg-card border border-border">
              <SelectItem value="with">{t.panels.withVat}</SelectItem>
              <SelectItem value="without">{t.panels.withoutVat}</SelectItem>
            </SelectContent>
          </Select>
          {errors.vatMode && (
            <p className="text-xs text-destructive">{errors.vatMode}</p>
          )}
        </div>

        {/* Country */}
        <div className="space-y-2">
          <Label htmlFor="country" className="text-sm font-medium">
            {t.request.country} <span className="text-destructive">*</span>
          </Label>
          {hasCountryOptions ? (
            <Select
              value={formData.country || ''}
              onValueChange={(value) => {
                onChange('country', value);
                if (value !== 'other') {
                  onChange('countryOther', '');
                }
                if (value !== 'China') {
                  onChange('city' as any, '');
                }
              }}
              disabled={isReadOnly}
            >
              <SelectTrigger className={errors.country ? 'border-destructive' : ''}>
                <SelectValue placeholder={t.request.selectCountry} />
              </SelectTrigger>
              <SelectContent className="z-50 bg-card border border-border">
                {countryOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateOption(option)}
                  </SelectItem>
                ))}
                <SelectItem value="other">{t.common.other}</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="country"
              value={formData.country || ''}
              onChange={(e) => onChange('country', e.target.value)}
              placeholder={t.request.countryExample}
              disabled={isReadOnly}
              className={errors.country ? 'border-destructive' : ''}
            />
          )}
          {errors.country && (
            <p className="text-xs text-destructive">{errors.country}</p>
          )}
        </div>

        {/* Incoterm Other */}
        {showIncotermOther && (
          <div className="space-y-2">
            <Label htmlFor="incotermOther" className="text-sm font-medium">
              {t.panels.enterIncoterm} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="incotermOther"
              value={formData.incotermOther || ''}
              onChange={(e) => onChange('incotermOther', e.target.value)}
              placeholder={t.panels.enterIncoterm}
              disabled={isReadOnly}
              className={errors.incotermOther ? 'border-destructive' : ''}
            />
            {errors.incotermOther && (
              <p className="text-xs text-destructive">{errors.incotermOther}</p>
            )}
          </div>
        )}

        {/* City */}
        {showCity && (
          <div className="space-y-2">
            <Label htmlFor="city" className="text-sm font-medium">
              {t.request.city} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="city"
              value={(formData as any).city || ''}
              onChange={(e) => onChange('city' as any, e.target.value)}
              placeholder={t.request.enterCity}
              disabled={isReadOnly}
              className={(errors as any).city ? 'border-destructive' : ''}
            />
            {(errors as any).city && (
              <p className="text-xs text-destructive">{(errors as any).city}</p>
            )}
          </div>
        )}

        {/* Client Address Delivery */}
        <div className="space-y-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="clientAddressDelivery" className="text-sm font-medium">
            {t.request.clientAddressDelivery} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="clientAddressDelivery"
            value={formData.clientAddressDelivery || ''}
            onChange={(e) => onChange('clientAddressDelivery', e.target.value)}
            placeholder={t.request.enterClientAddressDelivery}
            disabled={isReadOnly}
            className={errors.clientAddressDelivery ? 'border-destructive' : ''}
          />
          {errors.clientAddressDelivery && (
            <p className="text-xs text-destructive">{errors.clientAddressDelivery}</p>
          )}
        </div>

        {/* Country Other - shown when "Other" is selected */}
        {showCountryOther && hasCountryOptions && (
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="countryOther" className="text-sm font-medium">
              {t.request.specifyCountry} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="countryOther"
              value={(formData as any).countryOther || ''}
              onChange={(e) => onChange('countryOther' as any, e.target.value)}
              placeholder={t.request.enterCountry}
              disabled={isReadOnly}
              className={(errors as any).countryOther ? 'border-destructive' : ''}
            />
            {(errors as any).countryOther && (
              <p className="text-xs text-destructive">{(errors as any).countryOther}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionGeneralInfo;
