import { useEffect, useState } from 'react';
import { Check, Minus, Plus, Utensils } from 'lucide-react';
import type { CatalogItem, CatalogModifierGroup, CatalogModifierOption, Merchant } from '../../../providers/DiscoveryProvider';
import { getDemoRestaurantModifierGroups } from '../../../data/demo/restaurantModifiers';
import { formatPrice } from '../../../lib/formatPrice';
import { ImageWithFallback } from '../../ImageWithFallback';
import type { RestaurantDemoBasketLine } from './types';

interface RestaurantItemDetailDialogProps {
  item?: CatalogItem;
  merchant: Merchant;
  onClose: () => void;
  onAddToDemoBasket: (line: RestaurantDemoBasketLine) => void;
}

function optionPrice(option: CatalogModifierOption) {
  return formatPrice({ price: option.priceDelta, currency: option.currency });
}

export function RestaurantItemDetailDialog({ item, merchant, onClose, onAddToDemoBasket }: RestaurantItemDetailDialogProps) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [basketStatus, setBasketStatus] = useState('');
  const sourceGroups = item?.modifierGroups ?? [];
  const hasSourceGroups = sourceGroups.length > 0;
  const groups: CatalogModifierGroup[] = hasSourceGroups ? sourceGroups : getDemoRestaurantModifierGroups(item?.name ?? '');
  const chosenOptions = groups.flatMap((group) => group.options.filter((option) => selectedOptions[group.id]?.includes(option.id)));
  const selectionValid = groups.every((group) => {
    const count = selectedOptions[group.id]?.length ?? 0;
    return count >= group.minSelections && count <= group.maxSelections;
  });
  const currencyValid = chosenOptions.every((option) => Boolean(item?.currency) && option.currency === item?.currency);
  const optionTotal = chosenOptions.reduce((total, option) => total + option.priceDelta, 0);
  const unitTotal = item?.price === undefined ? undefined : item.price + optionTotal;
  const orderTotal = unitTotal === undefined ? undefined : unitTotal * quantity;
  const orderTotalLabel = orderTotal === undefined || !item?.currency ? undefined : formatPrice({ price: orderTotal, currency: item.currency });
  const itemPrice = item && formatPrice(item);
  const hasDemoGroups = groups.length > 0 && !hasSourceGroups;

  useEffect(() => {
    if (!dialog) return;
    if (item && !dialog.open) dialog.showModal();
    if (!item && dialog.open) dialog.close();
  }, [dialog, item]);

  useEffect(() => {
    setQuantity(1);
    setSelectedOptions({});
    setBasketStatus('');
  }, [item?.id]);

  const close = () => {
    if (dialog?.open) dialog.close();
    else onClose();
  };

  const toggleOption = (group: CatalogModifierGroup, option: CatalogModifierOption) => {
    if (option.isAvailable === false) return;
    setBasketStatus('');
    setSelectedOptions((current) => {
      const selection = current[group.id] ?? [];
      const selected = selection.includes(option.id);
      if (selected) return { ...current, [group.id]: selection.filter((id) => id !== option.id) };
      if (selection.length >= group.maxSelections) {
        if (group.maxSelections === 1) return { ...current, [group.id]: [option.id] };
        return current;
      }
      return { ...current, [group.id]: [...selection, option.id] };
    });
  };

  const addToPreviewBasket = () => {
    if (!item || item.isAvailable === false || unitTotal === undefined || !item.currency || !selectionValid || !currencyValid) return;
    const line: RestaurantDemoBasketLine = {
      merchantId: item.merchantId,
      itemId: item.id,
      quantity,
      unitTotal,
      currency: item.currency,
      selectedOptionIds: chosenOptions.map((option) => option.id),
    };
    onAddToDemoBasket(line);
    setBasketStatus(`${quantity} ${quantity === 1 ? 'item added' : 'items added'} to the demo basket. No order was submitted.`);
  };

  return <dialog
    ref={setDialog}
    className="restaurant-item-dialog"
    aria-labelledby="restaurant-item-dialog-title"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClose={onClose}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}
  >
    {item && <div className="restaurant-item-dialog__layout">
      <div className="restaurant-item-dialog__visual">
        <ImageWithFallback src={item.image} alt="" width={760} height={900} className="restaurant-item-dialog__image" referrerPolicy="no-referrer" />
      </div>
      <div className="restaurant-item-dialog__content">
        <button type="button" className="icon-button restaurant-item-dialog__close" onClick={close} aria-label="Close item details" autoFocus>
          <span aria-hidden="true">×</span>
        </button>
        <p className="restaurant-item-dialog__merchant">From <span>{merchant.name}</span></p>
        <h2 id="restaurant-item-dialog-title">{item.name}</h2>
        {itemPrice && <p className="restaurant-item-dialog__price">{itemPrice}</p>}
        {item.description && <p className="restaurant-item-dialog__description">{item.description}</p>}
        {item.isAvailable === false && <p className="restaurant-dish-card__unavailable">Unavailable</p>}

        {groups.map((group) => <fieldset key={group.id} className="restaurant-item-dialog__modifier-group">
          <legend>{group.name}{group.required ? <span> · required</span> : <span> · optional</span>}</legend>
          {group.minSelections > 0 && <p className="restaurant-item-dialog__group-hint">Choose at least {group.minSelections}</p>}
          <div className="restaurant-item-dialog__options">
            {group.options.map((option) => {
              const selected = selectedOptions[group.id]?.includes(option.id) ?? false;
              const unavailable = option.isAvailable === false;
              return <label key={option.id} className={`restaurant-modifier-option${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={unavailable}
                  onChange={() => toggleOption(group, option)}
                  aria-label={`${option.name}, add ${optionPrice(option) ?? `${option.currency} ${option.priceDelta}`}`}
                />
                <span className="restaurant-modifier-option__icon"><Utensils size={18} aria-hidden="true" /></span>
                <span className="restaurant-modifier-option__copy">
                  <strong>{option.name}</strong>
                  {option.description && <small>{option.description}</small>}
                  {unavailable && <small>Currently unavailable</small>}
                </span>
                <span className="restaurant-modifier-option__price">+ {optionPrice(option) ?? `${option.currency} ${option.priceDelta}`}</span>
                <span className="restaurant-modifier-option__check" aria-hidden="true">{selected && <Check size={14} />}</span>
              </label>;
            })}
          </div>
        </fieldset>)}

        {hasDemoGroups && <p className="restaurant-item-dialog__preview-note">Example add-ons and prices for this demo. Confirm choices with the merchant before launch.</p>}
        {!hasDemoGroups && groups.length === 0 && <p className="restaurant-item-dialog__preview-note">No add-ons are listed for this item.</p>}
        {groups.length > 0 && hasSourceGroups && <p className="restaurant-item-dialog__preview-note">Options came with this catalog item. Basket actions below are a local preview only.</p>}
        {groups.length === 0 && <div className="restaurant-item-dialog__divider" />}

        <div className="restaurant-item-dialog__quantity" aria-label="Item quantity">
          <span>Quantity</span>
          <div className="restaurant-quantity-control">
            <button type="button" onClick={() => { setQuantity((value) => Math.max(1, value - 1)); setBasketStatus(''); }} aria-label="Decrease quantity" disabled={quantity <= 1}><Minus size={16} /></button>
            <output aria-live="polite">{quantity}</output>
            <button type="button" onClick={() => { setQuantity((value) => Math.min(20, value + 1)); setBasketStatus(''); }} aria-label="Increase quantity" disabled={quantity >= 20}><Plus size={16} /></button>
          </div>
        </div>
        <p className="restaurant-item-dialog__demo-note">Demo basket only · no checkout or order is connected.</p>
        {basketStatus && <p className="restaurant-item-dialog__basket-status" role="status">{basketStatus}</p>}
        <button
          type="button"
          className="restaurant-item-dialog__order"
          onClick={addToPreviewBasket}
          disabled={item.isAvailable === false || unitTotal === undefined || !item.currency || !selectionValid || !currencyValid}
        >
          <span>{groups.length > 0 ? 'Add to demo basket' : 'Add to demo basket'}</span>
          {orderTotalLabel && <strong>{orderTotalLabel}</strong>}
        </button>
      </div>
    </div>}
  </dialog>;
}
