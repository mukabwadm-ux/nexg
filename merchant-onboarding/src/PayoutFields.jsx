import React from 'react';

export default function PayoutFields({
  value,
  onChange,
  renderField = undefined,
  previewMode = false,
}) {
  const set = (name, v) => onChange({ ...value, [name]: v });
  const field =
    renderField ||
    ((spec, v, change) => (
      <div className="mo-field">
        <label htmlFor={spec.id}>{spec.label}</label>
        <input id={spec.id} value={v || ''} onChange={(e) => change(e.target.value)} />
        {spec.help && <small>{spec.help}</small>}
      </div>
    ));
  return (
    <div className="mo-grid">
      <div className="mo-field">
        <label htmlFor="payout-method">
          Payout method <span className="mo-optional">Optional for now</span>
        </label>
        <select
          id="payout-method"
          value={value.method}
          onChange={(e) => set('method', e.target.value)}
        >
          <option value="">Choose later</option>
          <option value="mpesa_till">M-Pesa Till / Buy Goods</option>
          <option value="mpesa_paybill">M-Pesa PayBill</option>
          <option value="bank">Bank account</option>
          {value.method === 'mobile_money' && (
            <option value="mobile_money">
              Previous mobile number · choose a supported destination
            </option>
          )}
        </select>
      </div>
      {value.method === 'mpesa_till' &&
        field(
          { id: 'payout-till', label: 'Till number' },
          value.tillNumber,
          (v) => set('tillNumber', v),
          'payout.tillNumber',
        )}
      {value.method === 'mpesa_paybill' && (
        <>
          {field(
            { id: 'payout-paybill', label: 'PayBill / business number' },
            value.paybillNumber,
            (v) => set('paybillNumber', v),
            'payout.paybillNumber',
          )}
          {field(
            {
              id: 'payout-reference',
              label: 'Account number / reference',
              help: 'Use the reference supplied for this PayBill account. Letters are allowed.',
            },
            value.accountReference,
            (v) => set('accountReference', v),
            'payout.accountReference',
          )}
        </>
      )}
      {value.method === 'mobile_money' && (
        <p className="mo-note">
          Your previous number {value.mobileNumber} is retained. Choose Till, PayBill or bank before
          saving a payout destination.
        </p>
      )}
      {value.method === 'bank' && (
        <>
          {field(
            { id: 'payout-holder', label: 'Account holder name' },
            value.holderName,
            (v) => set('holderName', v),
            'payout.holderName',
          )}
          {field(
            { id: 'bank-name', label: 'Bank name', required: true },
            value.bankName,
            (v) => set('bankName', v),
            'payout.bankName',
          )}
          {previewMode &&
            field(
              { id: 'bank-branch', label: 'Branch' },
              value.bankBranch,
              (v) => set('bankBranch', v),
              'payout.bankBranch',
            )}
          {field(
            { id: 'bank-account', label: 'Account number', required: true },
            value.bankAccount,
            (v) => set('bankAccount', v),
            'payout.bankAccount',
          )}
        </>
      )}
    </div>
  );
}
