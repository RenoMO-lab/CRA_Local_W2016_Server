import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RequestProduct, StudsPcdMode, STANDARD_STUDS_PCD_OPTIONS } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

interface StudsPcdBlockProps {
  formData: Partial<RequestProduct>;
  onChange: (field: keyof RequestProduct, value: any) => void;
  isReadOnly: boolean;
  errors?: Record<string, string>;
  idPrefix?: string;
}

const StudsPcdBlock: React.FC<StudsPcdBlockProps> = ({
  formData,
  onChange,
  isReadOnly,
  errors = {},
  idPrefix,
}) => {
  const { t, translateOption } = useLanguage();
  const fieldId = (suffix: string) => (idPrefix ? `${idPrefix}-${suffix}` : suffix);
  const mode = formData.studsPcdMode || 'standard';
  const standardSelections = Array.isArray(formData.studsPcdStandardSelections)
    ? formData.studsPcdStandardSelections
    : formData.studsPcdStandardSelections
      ? [String(formData.studsPcdStandardSelections)]
      : [];

  const handleModeChange = (newMode: StudsPcdMode) => {
    onChange('studsPcdMode', newMode);
    // Clear the other mode's data when switching
    if (newMode === 'standard') {
      onChange('studsPcdSpecialText', '');
    } else {
      onChange('studsPcdStandardSelections', []);
    }
  };

  const handleStandardSelectionChange = (optionId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...standardSelections, optionId]))
      : standardSelections.filter(id => id !== optionId);
    onChange('studsPcdStandardSelections', next);
  };

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t.request.studsPcd} <span className="text-destructive">*</span>
        </Label>
        
        {!isReadOnly && (
          <RadioGroup
            value={mode}
            onValueChange={(value) => handleModeChange(value as StudsPcdMode)}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="standard" id={fieldId('mode-standard')} />
              <Label htmlFor={fieldId('mode-standard')} className="text-sm font-normal cursor-pointer">
                {t.request.standardOptions}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="special" id={fieldId('mode-special')} />
              <Label htmlFor={fieldId('mode-special')} className="text-sm font-normal cursor-pointer">
                {t.request.specialPcd}
              </Label>
            </div>
          </RadioGroup>
        )}
      </div>

      {mode === 'standard' ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t.request.selectStandardOptions}:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {STANDARD_STUDS_PCD_OPTIONS.map((option) => (
              <div
                key={option.id}
                className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg border transition-colors",
                  standardSelections.includes(option.id)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50",
                  isReadOnly && "opacity-60"
                )}
              >
                <Checkbox
                  id={fieldId(option.id)}
                  checked={standardSelections.includes(option.id)}
                  onCheckedChange={(checked) => handleStandardSelectionChange(option.id, !!checked)}
                  disabled={isReadOnly}
                />
                <Label
                  htmlFor={fieldId(option.id)}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {translateOption(option.label)}
                </Label>
              </div>
            ))}
          </div>
          {errors.studsPcdStandardSelections && (
            <p className="text-xs text-destructive">{errors.studsPcdStandardSelections}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t.request.enterSpecialPcd}:
          </p>
          <Textarea
            value={formData.studsPcdSpecialText || ''}
            onChange={(e) => onChange('studsPcdSpecialText', e.target.value)}
            placeholder={t.request.specialPcdExample}
            rows={3}
            disabled={isReadOnly}
            className={errors.studsPcdSpecialText ? 'border-destructive' : ''}
          />
          {errors.studsPcdSpecialText && (
            <p className="text-xs text-destructive">{errors.studsPcdSpecialText}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default StudsPcdBlock;
