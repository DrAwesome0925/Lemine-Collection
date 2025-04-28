  /*!
  * FilterableList.js - A custom filter plugin.
  * Version: 1.0
  * Author: Kofi Opoku + GPT
  * Year: 2025
  * License: MIT License
  */

// --- Global Configuration ---
window.FilterableListDefaults = {
    listSelector: '.filterable-list',
    itemSelector: ':scope > .item',
    itemDataAttribute: 'properties',
    hiddenClass: 'hidden',
    activeFilterClass: 'active',
    enableTransitions: true,
    transitionDuration: 400,
};

/**
 * Allows users to override default options for all FilterableList instances
 * initialized after this function is called.
 * @param {object} userOptions An object containing options to override.
 */
window.configureFilterableList = function(userOptions) {
    if (typeof userOptions === 'object' && userOptions !== null) {
        if (userOptions.hasOwnProperty('enableTransitions') && typeof userOptions.enableTransitions !== 'boolean') {
            console.warn('configureFilterableList: Invalid value for enableTransitions. Expected boolean.');
            delete userOptions.enableTransitions;
        }
        if (userOptions.hasOwnProperty('transitionDuration')) {
            const duration = parseInt(userOptions.transitionDuration, 10);
            if (isNaN(duration) || duration < 0) {
                console.warn('configureFilterableList: Invalid value for transitionDuration. Expected non-negative number (milliseconds).');
                delete userOptions.transitionDuration;
            } else {
                userOptions.transitionDuration = duration;
            }
        }

        Object.assign(window.FilterableListDefaults, userOptions);
        console.log('FilterableList defaults updated:', window.FilterableListDefaults);
    } else {
        console.warn('configureFilterableList: Invalid options provided. Expected an object.');
    }
};
// --- End Global Configuration ---


class FilterableList {
    /**
     * Initializes a new FilterableList instance.
     * @param {string | Element} containerSelectorOrElement - CSS selector or DOM element for the container.
     * @param {object} options - Configuration options for this instance.
     */
    constructor(containerSelectorOrElement, options = {}) {
        if (typeof containerSelectorOrElement === 'string') {
            this.container = document.querySelector(containerSelectorOrElement);
            if (!this.container) {
                console.error(`FilterableList: Container "${containerSelectorOrElement}" not found.`);
                return;
            }
        } else if (containerSelectorOrElement instanceof Element) {
            this.container = containerSelectorOrElement;
        } else {
             console.error(`FilterableList: Invalid argument provided. Expected a CSS selector string or a DOM element.`);
             return;
        }
        const internalDefaults = {
            listSelector: '.filterable-list',
            itemSelector: ':scope > .item',
            itemDataAttribute: 'properties',
            hiddenClass: 'hidden',
            activeFilterClass: 'active',
            enableTransitions: true,
            transitionDuration: 400
        };
        this.options = { ...internalDefaults, ...window.FilterableListDefaults, ...options };

        this.listElement = this.container.querySelector(this.options.listSelector);
        this.noMatchesMessageElement = this.listElement.querySelector('.no-matches-message');

        if (!this.listElement) {
            console.error(`FilterableList: Could not find list element within "${containerSelectorOrElement}".`);
            return;
        }

        this.items = Array.from(this.listElement.querySelectorAll(this.options.itemSelector));
        this.originalOrder = [...this.items];
        this.filterControlElements = Array.from(this.container.querySelectorAll('[data-action]'));

        this.itemPropertiesMap = new Map();
        this.items.forEach(item => {
            const propString = item.dataset[this.options.itemDataAttribute];
            this.itemPropertiesMap.set(item, this.parsePropertiesString(propString));
        });

        if (this.items.length === 0) console.warn(`FilterableList: No items found.`);
        if (this.filterControlElements.length === 0) console.warn(`FilterableList: No filter controls with [data-action] found.`);

        this.activeFilters = new Map();

        this.currentSortAttribute = null;
        this.currentSortDirection = 'asc';

        this.bindEvents();
        console.log(`FilterableList initialized for "${containerSelectorOrElement}" with ${this.items.length} items and ${this.filterControlElements.length} controls.`);
    }

    /**
     * Parses the property string from a data attribute into an object.
     * Attempts to convert numeric values to numbers.
     * Handles keys or values that might contain hyphens.
     * @param {string | undefined} propString The string from the data attribute.
     * @returns {object} An object containing the parsed properties.
     */
    parsePropertiesString(propString) {
        const properties = {};
        if (!propString) return properties;

        propString.trim().split(/\s+/).forEach(pair => {
            const lastHyphenIndex = pair.lastIndexOf('-');

            if (lastHyphenIndex > 0 && lastHyphenIndex < pair.length - 1) {
                const key = pair.substring(0, lastHyphenIndex).trim();
                const rawValue = pair.substring(lastHyphenIndex + 1).trim();

                if (key && rawValue) {
                    const numValue = parseFloat(rawValue);
                    properties[key] = !isNaN(numValue) && /^-?\d+(\.\d+)?$/.test(rawValue)
                        ? numValue
                        : rawValue;
                } else {
                     console.warn(`FilterableList: Skipped pair "${pair}" due to empty key or value after parsing.`);
                }
            } else {
                 console.warn(`FilterableList: Could not find valid key-value separator (-) in pair "${pair}" or separator is at start/end.`);
            }
        });
        return properties;
    }

    /**
     * Retrieves the pre-parsed value for a given attribute from an item.
     * @param {Element} item The DOM element.
     * @param {string} attribute The attribute key (e.g., 'capacity').
     * @returns {string | number | null} The value, or null if not found.
     */
    getItemValue(item, attribute) {
        const properties = this.itemPropertiesMap.get(item);
        return properties && properties.hasOwnProperty(attribute) ? properties[attribute] : null;
    }

    /**
     * Binds event listeners to filter control elements.
     */
    bindEvents() {
        this.filterControlElements.forEach(element => {
            const eventType = this.getEventTypeForElement(element);
            element.addEventListener(eventType, (event) => {
                if (eventType === 'click' && element.tagName.toLowerCase() === 'a') event.preventDefault();
                this.handleFilterInteraction(element);
            });
        });
    }

    /**
     * Determines the appropriate event type for a given control element.
     * @param {Element} element The control element.
     * @returns {string} The event type (e.g., 'click', 'change', 'input').
     */
    getEventTypeForElement(element) {
        switch(element.tagName.toLowerCase()) {
            case 'input':
                if (['checkbox', 'radio'].includes(element.type)) return 'change';
                if (['text', 'search'].includes(element.type)) return 'input';
                return 'change';
            case 'select':
                return 'change';
            default:
                return 'click';
        }
    }

    /**
     * Handles user interaction with a filter control element.
     * @param {Element} element The interacted element.
     */
    handleFilterInteraction(element) {
        const action = element.dataset.action;
        let attribute = element.dataset.filterAttribute;
        let value;
        let isRadio = false;

        switch(element.tagName.toLowerCase()) {
            case 'input':
                if (element.type === 'checkbox') {
                    value = element.checked ? element.dataset.filterValue : null;
                    if (!element.checked && action === 'filter') {
                        this.removeFilter(attribute, element.dataset.filterValue);
                        return;
                    }
                } else if (element.type === 'radio') {
                    isRadio = true;
                    value = element.checked ? element.dataset.filterValue : null;
                    if (!element.checked) return;
                } else {
                    value = element.value;
                }
                break;
            case 'select':
                value = element.value;
                if (action === 'sort' && !attribute) {
                    attribute = value;
                }
                break;
            default:
                value = element.dataset.filterValue;
        }

        console.log(`Action: ${action}, Attribute: ${attribute}, Value: ${value}, IsRadio: ${isRadio}`);

        if (action === 'sort') {
            if (attribute === this.currentSortAttribute) {
                this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.currentSortAttribute = attribute;
                this.currentSortDirection = 'asc';
            }
            this.updateActiveState(element);
            this.sortItems();
            return;
        }

        if (action === 'filter') {
            if (!isRadio && attribute && value && this.isFilterActive(attribute, value)) {
                this.removeFilter(attribute, value);
                if (element.tagName.toLowerCase() !== 'input') {
                     element.classList.remove(this.options.activeFilterClass);
                }
                return;
            }

            this.filterItems(attribute, value, isRadio);
            if (element.tagName.toLowerCase() !== 'input') {
                 this.updateActiveState(element);
            }
            return;
        }
        if (action !== 'reverse' && element.tagName.toLowerCase() !== 'input') {
             this.updateActiveState(element);
        }

        switch (action) {
            case 'reset': this.resetItems(); break;
            case 'reverse': this.reverseItems(); break;
            default: console.warn(`Unknown action: ${action}`);
        }
    }

    /**
     * Checks if a specific filter attribute and value are currently active.
     * @param {string} attribute The filter attribute.
     * @param {string} value The filter value.
     * @returns {boolean} True if the filter is active, false otherwise.
     */
    isFilterActive(attribute, value) {
        return this.activeFilters.has(attribute) &&
               this.activeFilters.get(attribute).has(value);
    }

    /**
     * Handles clicks on filter links (legacy or specific use case).
     * @param {Element} clickedLink The clicked link element.
     */
    handleFilterClick(clickedLink) {
        const action = clickedLink.dataset.action;
        const attribute = clickedLink.dataset.filterAttribute;
        const value = clickedLink.dataset.filterValue;

        console.log(`Action: ${action}, Attribute: ${attribute}, Value: ${value}`);

        this.filterLinks.forEach(el => el.classList.remove(this.options.activeFilterClass));
        clickedLink.classList.add(this.options.activeFilterClass);

        switch (action) {
            case 'sort': this.sortItems(attribute); break;
            case 'filter': this.filterItems(attribute, value); break;
            case 'reset': this.resetItems(); break;
            default: console.warn(`Unknown action: ${action}`);
        }
    }

    /**
     * Returns a comparison function based on the current sort attribute and direction.
     * @returns {Function} A comparison function for Array.prototype.sort().
     */
    compareItems() {
        const attribute = this.currentSortAttribute;
        const directionMultiplier = this.currentSortDirection === 'asc' ? 1 : -1;

        if (!attribute) return () => 0;

        return (a, b) => {
            const valueA = this.getItemValue(a, attribute);
            const valueB = this.getItemValue(b, attribute);

            if (valueA === null && valueB === null) return 0;
            if (valueA === null) return 1;
            if (valueB === null) return -1;

            let comparison = 0;
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                comparison = valueA - valueB;
            } else {
                comparison = String(valueA).toLowerCase().localeCompare(String(valueB).toLowerCase());
            }
            return comparison * directionMultiplier;
        };
    }

    /**
     * Helper to perform FLIP animation.
     * @param {Function} domChangeFn - Function that performs the DOM manipulation (sorting, filtering).
     * @param {Array<Element>} elementsToAnimate - The specific elements to apply FLIP to.
     */
    animateWithFlip(domChangeFn, elementsToAnimate) {
        if (!this.options.enableTransitions) {
            domChangeFn();
            return;
        }

        const firstRects = new Map();
        elementsToAnimate.forEach(item => {
            firstRects.set(item, item.getBoundingClientRect());
        });

        domChangeFn();

        elementsToAnimate.forEach(item => {
            const lastRect = item.getBoundingClientRect();
            const firstRect = firstRects.get(item);

            if (firstRect && lastRect) {
                const deltaX = firstRect.left - lastRect.left;
                const deltaY = firstRect.top - lastRect.top;

                if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                    item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                    item.style.transition = 'none';
                } else {
                    item.style.transform = '';
                }
            } else {
                 item.style.transform = '';
            }
        });

        this.listElement.offsetHeight;

        elementsToAnimate.forEach(item => {
            if (item.style.transform !== '') {
                item.style.transition = `transform ${this.options.transitionDuration}ms ease-in-out`;
                item.style.transform = '';

                const cleanup = () => {
                    item.style.transition = '';
                    item.removeEventListener('transitionend', cleanup);
                };
                item.addEventListener('transitionend', cleanup, { once: true });
            }
        });
    }

    /**
     * Sorts the items based on the current sort attribute and direction, with animation.
     */
    sortItems() {
        if (!this.currentSortAttribute) {
            console.warn("Sort action attempted without a selected attribute.");
            return;
        }

        const visibleItems = this.items.filter(item => !item.classList.contains(this.options.hiddenClass));

        const sortDomChange = () => {
            this.items.sort(this.compareItems());
            this.items.forEach(item => this.listElement.appendChild(item));
            this._applyFilterClasses();
        };

        this.animateWithFlip(sortDomChange, visibleItems);

        console.log(`Sorted by ${this.currentSortAttribute} (${this.currentSortDirection})`);
        this._updateNoMatchesMessage();
    }

    /**
     * Reverses the current order of items in the list, with animation.
     */
    reverseItems() {
        const currentVisibleItems = Array.from(this.listElement.children)
                                      .filter(el => el.classList.contains('item') && !el.classList.contains(this.options.hiddenClass));

        const reverseDomChange = () => {
            const allCurrentItems = Array.from(this.listElement.children)
                                        .filter(el => el.classList.contains('item'));
            allCurrentItems.reverse();
            allCurrentItems.forEach(item => this.listElement.appendChild(item));
            this.items = allCurrentItems;
        };

        this.animateWithFlip(reverseDomChange, currentVisibleItems);

        console.log("Reversed item order.");
        this._updateNoMatchesMessage();
    }

    /**
     * Adds a filter based on attribute and value.
     * @param {string} attribute The attribute to filter by.
     * @param {string} filterValue The value to filter for.
     * @param {boolean} [isRadio=false] Indicates if the filter comes from a radio button.
     */
    filterItems(attribute, filterValue, isRadio = false) {
        if (!attribute || filterValue === null) return;

        if (isRadio && this.activeFilters.has(attribute)) {
            this.activeFilters.get(attribute).clear();
        }

        if (!this.activeFilters.has(attribute)) {
            this.activeFilters.set(attribute, new Set());
        }
        this.activeFilters.get(attribute).add(filterValue);

        this.applyFilters();
        this.updateControlStates();
    }

    /**
     * Removes a specific filter.
     * @param {string} attribute The attribute of the filter to remove.
     * @param {string} filterValue The value of the filter to remove.
     */
    removeFilter(attribute, filterValue) {
        if (this.activeFilters.has(attribute)) {
            this.activeFilters.get(attribute).delete(filterValue);
            if (this.activeFilters.get(attribute).size === 0) {
                this.activeFilters.delete(attribute);
            }
        }
        this.applyFilters();
        this.updateControlStates();
    }

    /**
     * Applies the currently active filters to the items by toggling the hidden class.
     * This is an internal helper method.
     * @returns {number} The number of items currently visible after applying filters.
     */
    _applyFilterClasses() {
        let visibleItemCount = 0;
        this.items.forEach(item => {
            let shouldShow = true;
            if (this.activeFilters.size > 0) {
                for (const [attribute, values] of this.activeFilters.entries()) {
                    const itemValue = this.getItemValue(item, attribute);
                    const matchesAny = Array.from(values).some(filterValue => {
                        const itemValStr = itemValue != null ? String(itemValue).toLowerCase() : '';
                        const filterValStr = filterValue != null ? String(filterValue).toLowerCase() : '';
                        return itemValStr === filterValStr;
                    });
                    if (!matchesAny) {
                        shouldShow = false;
                        break;
                    }
                }
            }
            const wasHidden = item.classList.contains(this.options.hiddenClass);
            if (shouldShow) {
                item.classList.remove(this.options.hiddenClass);
                visibleItemCount++;
            } else {
                item.classList.add(this.options.hiddenClass);
            }
        });
        return visibleItemCount;
    }

    /**
     * Updates the visibility of the 'no matches' message based on visible item count.
     * This is an internal helper method.
     * @param {number} [count=-1] Optional explicit count of visible items. If -1, calculates internally.
     */
    _updateNoMatchesMessage(count = -1) {
         if (this.noMatchesMessageElement) {
             const visibleCount = count === -1
                 ? this.items.filter(item => !item.classList.contains(this.options.hiddenClass)).length
                 : count;
             this.noMatchesMessageElement.style.display = visibleCount === 0 ? 'list-item' : 'none';
         }
    }

    /**
     * Applies the current filters to the list items, updating visibility.
     * Note: This version bypasses FLIP for filtering, relying on CSS transitions.
     */
    applyFilters() {
        const visibleCount = this._applyFilterClasses();
        this._updateNoMatchesMessage(visibleCount);

        console.log(`Applied filters (without FLIP).`);
    }

    /**
     * Resets all filters and sorting, restoring the original item order with animation.
     */
    resetItems() {
        const visibleItemsBeforeReset = this.items.filter(item => !item.classList.contains(this.options.hiddenClass));

        const resetDomChange = () => {
            this.activeFilters.clear();
            this.currentSortAttribute = null;
            this.currentSortDirection = 'asc';

            this.originalOrder.forEach(item => {
                 item.classList.remove(this.options.hiddenClass);
                 this.listElement.appendChild(item);
            });
            this.items = [...this.originalOrder];

            this.filterControlElements.forEach(control => {
                 if (control.tagName.toLowerCase() === 'input' && (control.type === 'checkbox' || control.type === 'radio')) {
                    control.checked = false;
                } else if (control.tagName.toLowerCase() === 'select') {
                     control.selectedIndex = 0;
                }
                control.classList.toggle(this.options.activeFilterClass, control.dataset.action === 'reset');
                if (control.dataset.action === 'sort' && control.tagName.toLowerCase() !== 'select' && control.dataset.sortText) {
                    control.innerHTML = control.dataset.sortText;
                }
            });
             this._updateNoMatchesMessage();
        };

        this.animateWithFlip(resetDomChange, visibleItemsBeforeReset);

        console.log("List reset to original state (with FLIP).");
    }

    /**
     * Updates the visual state (e.g., active class) of all control elements based on the current filter/sort state.
     */
    updateControlStates() {
        this.filterControlElements.forEach(el => {
            const action = el.dataset.action;
            const attr = el.dataset.filterAttribute;
            const val = el.dataset.filterValue;

            if (action === 'filter') {
                if (el.tagName.toLowerCase() !== 'input' && attr && val != null) {
                    const isActive = this.isFilterActive(attr, val);
                    el.classList.toggle(this.options.activeFilterClass, isActive);
                }
            } else if (action === 'reset') {
                el.classList.toggle(this.options.activeFilterClass, this.activeFilters.size === 0 && !this.currentSortAttribute);
            } else if (action === 'sort' && el.tagName.toLowerCase() !== 'select') {
                 el.classList.toggle(this.options.activeFilterClass, this.currentSortAttribute === attr);
            } else if (action === 'sort' && el.tagName.toLowerCase() === 'select') {
                 const resetControl = this.filterControlElements.find(c => c.dataset.action === 'reset');
                 if (resetControl && this.currentSortAttribute) {
                     resetControl.classList.remove(this.options.activeFilterClass);
                 }
            }
        });
    }

    /**
     * Updates the active state styling for a specific control element and potentially related controls.
     * @param {Element} element The control element that was interacted with.
     */
    updateActiveState(element) {
        if (element.tagName.toLowerCase() === 'input' &&
            (element.type === 'checkbox' || element.type === 'radio')) {
            this.updateControlStates();
            return;
        }

        if (element.tagName.toLowerCase() === 'select' && element.dataset.action === 'sort') {
            this.filterControlElements.forEach(el => {
                 if (el.dataset.action === 'sort' && el.tagName.toLowerCase() !== 'select') {
                     el.classList.remove(this.options.activeFilterClass);
                     if (el.dataset.sortText) {
                         el.innerHTML = el.dataset.sortText;
                     }
                 }
            });
            this.updateControlStates();
            return;
        }

        const action = element.dataset.action;

        if (action === 'reset') {
            this.filterControlElements.forEach(el => {
                if (el !== element) {
                    el.classList.remove(this.options.activeFilterClass);
                    if (el.dataset.action === 'sort' && el.tagName.toLowerCase() !== 'select' && el.dataset.sortText) {
                        el.innerHTML = el.dataset.sortText;
                    }
                }
            });
            element.classList.add(this.options.activeFilterClass);

        } else if (action === 'filter') {
            this.updateControlStates();

        } else if (action === 'sort') {
            const clickedAttribute = element.dataset.filterAttribute;

            this.filterControlElements.forEach(el => {
                if (el.dataset.action === 'sort' && el.tagName.toLowerCase() !== 'select') {
                    el.classList.remove(this.options.activeFilterClass);
                    const baseText = el.dataset.sortText || el.textContent.replace(/\s*([↑↓]|\(A-Z\)|\(Z-A\))\s*$/,'').trim();
                    if (el.dataset.sortText) {
                        el.innerHTML = el.dataset.sortText;
                    } else {
                         el.dataset.sortText = baseText;
                         el.innerHTML = baseText;
                    }
                } else if (el.dataset.action === 'sort' && el.tagName.toLowerCase() === 'select') {
                     // Optional: Reset select if a link sort is clicked?
                     // el.selectedIndex = 0;
                }
            });

            const baseText = element.dataset.sortText || element.textContent.replace(/\s*([↑↓]|\(A-Z\)|\(Z-A\))\s*$/,'').trim();
            if (!element.dataset.sortText) {
                element.dataset.sortText = baseText;
            }

            let finalHTML = baseText;

            if (this.currentSortAttribute === clickedAttribute && clickedAttribute === 'name') {
                 const directionIndicatorText = this.currentSortDirection === 'asc' ? '(A-Z)' : '(Z-A)';
                 finalHTML = `${baseText} <span class="sort-direction">${directionIndicatorText}</span>`;
            }

            element.classList.add(this.options.activeFilterClass);
            element.innerHTML = finalHTML;
            this.updateControlStates();

        } else if (action === 'reverse') {
            this.updateControlStates();
        } else {
            console.warn(`updateActiveState: Unhandled action "${action}" for element:`, element);
            this.updateControlStates();
        }
    }
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    // Find all elements intended as filterable containers and initialize
    document.querySelectorAll('.filterable-container').forEach(containerElement => {
        new FilterableList(containerElement); // Pass the element directly
    });

    // Or initialize specific containers by selector:
    // new FilterableList('#mySpecificContainerId');
    // new FilterableList('.product-filters');
});