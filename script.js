const SHEET_JSON_URL = "https://docs.google.com/spreadsheets/d/1Vb0I2vzl0-OoqgPVnT9YSNxNSbKSleVFYDxXiNxq3nA/gviz/tq?tqx=out:json";

let allProperties = [];
let filteredProperties = [];
let visibleCount = 12; // how many cards show first
const LOAD_STEP = 12;  // how many load each click
let messageTemplates = [];


let currentFilters = {
    city: '',
    locality: '',
    size: '',
    status: '',
    search: ''
};

// ---------- HELPERS ----------

function parsePossessionDate(dateStr) {
    if (!dateStr || !dateStr.includes("Date")) return null;

    const match = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
    if (!match) return null;

    const year = parseInt(match[1]);
    const month = parseInt(match[2]); // JS month already 0-based in your sheet
    const day = parseInt(match[3]);

    return new Date(year, month, day);
}


function showToast(message = "Message copied") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2000);
}

function getProjectMessage(property) {
    const match = messageTemplates.find(m =>
        m.projectName === property.projectName &&
        m.city === property.city &&
        m.locality === property.locality
    );

    return match?.message || "Project message not available.";
}

function copyProjectMessage(propertyId) {
    const property = filteredProperties.find(p => p.id === propertyId);
    if (!property) return;

    const message = getProjectMessage(property);

    // Try modern clipboard first
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(message)
            .then(() => showToast("Message copied"))
            .catch(() => fallbackCopy(message));
    } else {
        fallbackCopy(message);
    }
}

function shareOnWhatsApp(propertyId) {
    const property = filteredProperties.find(p => p.id === propertyId);
    if (!property) return;

    const message = getProjectMessage(property);

    const encoded = encodeURIComponent(message);

    // Mobile + desktop compatible WhatsApp link
    const url = `https://wa.me/?text=${encoded}`;

    window.open(url, "_blank");
}

// Fallback method for mobile & non-HTTPS
function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    try {
        document.execCommand("copy");
        showToast("Message copied");
    } catch {
        showToast("Copy failed");
    }

    document.body.removeChild(textarea);
}


function toTitleCase(text) {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function priceToNumber(price) {
    if (!price) return 0;
    const str = price.toString().toLowerCase();
    const num = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;

    if (str.includes('cr')) return num * 10000000;
    if (str.includes('l')) return num * 100000;

    return num;
}

function formatPrice(price) {
    if (!price) return 'Price on request';
    return price.toString().replace(/\s+/g, '');
}

function formatBrokerage(b) {
    if (!b) return 'N/A';
    const num = parseFloat(b);
    if (num < 1) return (num * 100) + '%';
    return num + '%';
}

function formatPossessionMonthYear(value) {
    if (!value) return "N/A";

    const match = /Date\((\d+),(\d+),(\d+)\)/.exec(value);
    if (!match) return value;

    const year = parseInt(match[1]);
    const month = parseInt(match[2]);

    const date = new Date(year, month, 1);

    return date.toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric"
    });
}



// ---------- INIT ----------

document.addEventListener('DOMContentLoaded', async () => {
    await fetchProperties();
    await fetchMessageTemplates();
    initializeEventListeners();
});


// ---------- FETCH ----------

async function fetchProperties() {
    try {
        const response = await fetch(SHEET_JSON_URL);
        const text = await response.text();
        const json = JSON.parse(text.substring(47).slice(0, -2));

        const rows = json.table.rows;

        allProperties = rows.map((row, index) => {
            const cells = row.c;

            return {
                id: index,
                projectName: toTitleCase(cells[1]?.v || ''),
                city: toTitleCase(cells[2]?.v || ''),
                locality: toTitleCase(cells[3]?.v || ''),
                size: cells[5]?.v || '',
                detailedSizing: cells[6]?.v || '',
                totalUnits: cells[7]?.v || '',
                availableUnits: cells[8]?.v || '',
                pricePerSqYrd: cells[9]?.v || '',
                boxPrice: cells[10]?.v || '',
                saleDeadAmount: cells[11]?.v || '',
                amenities: cells[12]?.v || '',
                floors: cells[13]?.v || '',
                blocks: cells[14]?.v || '',
                parking: cells[15]?.v || '',
                status: toTitleCase(cells[16]?.v || ''),
                possessionTime: cells[17]?.v || '',
                reraRegistration: cells[18]?.v || '',
                builderName: toTitleCase(cells[19]?.v || ''),
            };

        });

        populateFilterOptions();
        filteredProperties = [...allProperties];
        renderProperties();

    } catch (error) {
        console.error('Error fetching properties:', error);
        showEmptyState();
    }
}

async function fetchMessageTemplates() {
    try {
        const url = SHEET_JSON_URL + "&sheet=Message%20Template";
        const response = await fetch(url);
        const text = await response.text();
        const json = JSON.parse(text.substring(47).slice(0, -2));

        messageTemplates = json.table.rows.map(r => {
            const c = r.c;
            return {
                projectName: toTitleCase(c[1]?.v || ''),
                city: toTitleCase(c[2]?.v || ''),
                locality: toTitleCase(c[3]?.v || ''),
                message: c[4]?.v || ''
            };
        });

    } catch (err) {
        console.error("Message template fetch error:", err);
    }
}


// ---------- INITIAL FILTER OPTIONS ----------

function populateFilterOptions() {
    updateDependentFilters();
}

// ---------- DEPENDENT FILTER LOGIC ----------

function updateDependentFilters() {

    let base = allProperties.filter(p =>
        (!currentFilters.city || p.city === currentFilters.city) &&
        (!currentFilters.locality || p.locality === currentFilters.locality) &&
        (!currentFilters.size || p.size === currentFilters.size) &&
        (!currentFilters.status || p.status === currentFilters.status)
    );

    // Cities
    const cities = [...new Set(base.map(p => p.city))].filter(Boolean).sort();
    const cityFilter = document.getElementById('cityFilter');
    const currentCity = cityFilter.value;
    cityFilter.innerHTML = '<option value="">All Cities</option>';
    cities.forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        cityFilter.appendChild(o);
    });
    if (cities.includes(currentCity)) cityFilter.value = currentCity;
    else currentFilters.city = '';

    // Localities
    base = allProperties.filter(p =>
        (!currentFilters.city || p.city === currentFilters.city)
    );

    const localities = [...new Set(base.map(p => p.locality))].filter(Boolean).sort();
    const localityFilter = document.getElementById('localityFilter');
    const currentLocality = localityFilter.value;
    localityFilter.innerHTML = '<option value="">All Localities</option>';
    localities.forEach(l => {
        const o = document.createElement('option');
        o.value = l;
        o.textContent = l;
        localityFilter.appendChild(o);
    });
    if (localities.includes(currentLocality)) localityFilter.value = currentLocality;
    else currentFilters.locality = '';

    // Sizes
    base = allProperties.filter(p =>
        (!currentFilters.city || p.city === currentFilters.city) &&
        (!currentFilters.locality || p.locality === currentFilters.locality)
    );

    const sizes = [...new Set(base.map(p => p.size))].filter(Boolean).sort();
    const sizeFilter = document.getElementById('sizeFilter');
    const currentSize = sizeFilter.value;
    sizeFilter.innerHTML = '<option value="">All Sizes</option>';
    sizes.forEach(s => {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        sizeFilter.appendChild(o);
    });
    if (sizes.includes(currentSize)) sizeFilter.value = currentSize;
    else currentFilters.size = '';

    // Status
    base = allProperties.filter(p =>
        (!currentFilters.city || p.city === currentFilters.city) &&
        (!currentFilters.locality || p.locality === currentFilters.locality) &&
        (!currentFilters.size || p.size === currentFilters.size)
    );

    const statuses = [...new Set(base.map(p => p.status))].filter(Boolean).sort();
    const statusFilter = document.getElementById('statusFilter');
    const currentStatus = statusFilter.value;
    statusFilter.innerHTML = '<option value="">All Status</option>';
    statuses.forEach(s => {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        statusFilter.appendChild(o);
    });
    if (statuses.includes(currentStatus)) statusFilter.value = currentStatus;
    else currentFilters.status = '';
}

// ---------- APPLY FILTER ----------

function applyFilters() {
    filteredProperties = allProperties.filter(property => {
        visibleCount = 12; // reset on new filter

        if (currentFilters.city && property.city !== currentFilters.city) return false;
        if (currentFilters.locality && property.locality !== currentFilters.locality) return false;
        if (currentFilters.size && property.size !== currentFilters.size) return false;
        if (currentFilters.status && property.status !== currentFilters.status) return false;

        if (currentFilters.search) {
            const searchTerm = currentFilters.search.toLowerCase();
            const searchableText = `${property.projectName} ${property.locality} ${property.builderName}`.toLowerCase();
            if (!searchableText.includes(searchTerm)) return false;
        }

        return true;
    });

    sortProperties();
}

// ---------- SORT ----------

function sortProperties() {
    const sortValue = document.getElementById('sortSelect').value;

    switch (sortValue) {
        case 'price-low':
            filteredProperties.sort((a, b) => priceToNumber(a.boxPrice) - priceToNumber(b.boxPrice));
            break;

        case 'price-high':
            filteredProperties.sort((a, b) => priceToNumber(b.boxPrice) - priceToNumber(a.boxPrice));
            break;

        case 'name':
            filteredProperties.sort((a, b) => a.projectName.localeCompare(b.projectName));
            break;

        case 'possession-near':
            filteredProperties.sort((a, b) => {
                const dateA = parsePossessionDate(a.possessionTime);
                const dateB = parsePossessionDate(b.possessionTime);

                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;   // push empty to bottom
                if (!dateB) return -1;

                return dateA - dateB;   // nearest possession first
            });
            break;

        default:
            filteredProperties.sort((a, b) => b.id - a.id);
    }

    renderProperties();
}

function groupProjects(properties) {
    const map = {};

    properties.forEach(p => {
        if (!map[p.projectName]) {
            map[p.projectName] = {
                ...p,
                sizes: [],
                prices: [],
                areas: []
            };
        }

        map[p.projectName].sizes.push(
            `${p.size} (${p.detailedSizing.replace(/Sq\.?\s*Yrd/gi, '').trim()} Sq.Yrd) - ${formatPrice(p.boxPrice)}`
        );


        map[p.projectName].prices.push(priceToNumber(p.boxPrice));

        map[p.projectName].areas.push(
            parseFloat(p.detailedSizing.replace(/[^0-9.]/g, '')) || 0
        );
    });

    return Object.values(map).map(p => {
        const minPrice = Math.min(...p.prices);
        const maxPrice = Math.max(...p.prices);

        const minArea = Math.min(...p.areas);
        const maxArea = Math.max(...p.areas);

        return {
            ...p,
            priceRange:
                minPrice === maxPrice
                    ? formatPriceFromNumber(minPrice)
                    : `${formatPriceFromNumber(minPrice)} – ${formatPriceFromNumber(maxPrice)}`,

            sizeRange:
                minArea === maxArea
                    ? `${minArea} Sq.Yrd`
                    : `${minArea} Sq.Yrd - ${maxArea} Sq.Yrd`,

            sizeList: [...new Set(p.sizes)]
        };

    });
}

function formatPriceFromNumber(num) {
    if (!num) return "₹0";

    let value;
    let unit;

    if (num >= 10000000) {
        value = (num / 10000000).toFixed(2);
        unit = "Cr";
    } else if (num >= 100000) {
        value = (num / 100000).toFixed(2);
        unit = "L";
    } else {
        value = num.toFixed(0);
        unit = "";
    }

    return `₹${value} ${unit}`.trim();
}




// ---------- RENDER ----------

function renderProperties() {
    const loadingSkeleton = document.getElementById('loadingSkeleton');
    const propertyGrid = document.getElementById('propertyGrid');
    const emptyState = document.getElementById('emptyState');
    const resultsInfo = document.getElementById('resultsInfo');

    loadingSkeleton.style.display = 'none';

    if (filteredProperties.length === 0) {
        propertyGrid.style.display = 'none';
        emptyState.style.display = 'block';
        resultsInfo.innerHTML = 'No properties found';
    } else {
        propertyGrid.style.display = 'grid';
        emptyState.style.display = 'none';
        resultsInfo.innerHTML = `Showing <strong>${filteredProperties.length}</strong> ${filteredProperties.length === 1 ? 'property' : 'properties'}`;

        const grouped = groupProjects(filteredProperties);
        const visibleProjects = grouped.slice(0, visibleCount);

        propertyGrid.innerHTML = visibleProjects.map(property => `
            <div class="property-card" onclick="showPropertyDetails(
    '${property.projectName}',
    '${property.city}',
    '${property.locality}'
)"
>
                <div class="property-content">
                    <div class="property-header">
    <h3 class="property-title">${property.projectName}</h3>

    <div class="property-status ${property.status?.toLowerCase().includes('ready') ? 'status-ready' : 'status-construction'}">
        ${property.status || 'N/A'}
    </div>
</div>

<div class="property-meta-row">
    <div class="property-location">
        ${property.locality}, ${property.city}
    </div>

    ${property.status?.toLowerCase().includes("under")
                ? `<div class="property-possession-inline">
                Possession: ${formatPossessionMonthYear(property.possessionTime)}
           </div>`
                : ""}
</div>



                    <div class="property-size">
                        <span class="size-icon"></span>
                        <span><strong>Size:</strong><br>${property.sizeList.join('<br>')}</span>
                    </div>

                    <div class="property-details">
                        <div class="property-price">${property.priceRange}</div>
                        <div class="property-size-badge action-buttons">
                             <button class="icon-btn copy-btn" onclick="event.stopPropagation(); copyProjectMessage(${property.id})">
    <img src="Assets/icons/copy.png" alt="Copy">
</button>

<button class="icon-btn whatsapp-btn" onclick="event.stopPropagation(); shareOnWhatsApp(${property.id})">
    <img src="Assets/icons/whatsapp.png" alt="WhatsApp">
</button>

                        </div>

                    </div>

                    <button class="property-cta">View Full Details</button>
                </div>
            </div>
        `).join('');

        // Load More button logic
        const loadMoreBtn = document.getElementById("loadMoreBtn");

        if (grouped.length > visibleCount) {
            loadMoreBtn.style.display = "inline-flex";
        } else {
            loadMoreBtn.style.display = "none";
        }

    }
}

// ---------- MODAL ----------

function showPropertyDetails(projectName, city, locality) {

    // get ALL variants of same project
    const variants = allProperties.filter(p =>
        p.projectName === projectName &&
        p.city === city &&
        p.locality === locality &&
        (!currentFilters.size || p.size === currentFilters.size)
    );

    if (!variants.length) return;

    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    modalTitle.textContent = projectName;

    modalContent.innerHTML = variants.map((v, i) => {

        const title =
            `${v.size} • ${v.detailedSizing.replace(/Sq\.?\s*Yrd/gi, '').trim()} Sq.Yrd • ${formatPriceFromNumber(priceToNumber(v.boxPrice))}`;

        const highlights = `
        <div class="variant-highlights">
            <span><strong>₹/Sq.Yrd:</strong> ${formatPrice(v.pricePerSqYrd)}</span>
            <span><strong>Box:</strong> ${formatPrice(v.boxPrice)}</span>
            <span><strong>Sale:</strong> ${formatPrice(v.saleDeadAmount)}</span>
            <span><strong>Status:</strong> ${v.status}</span>
        </div>
        `;

        const details = `
        <div class="variant-details">
            <div><strong>Available:</strong> ${v.availableUnits}</div>
            <div><strong>Floors:</strong> ${v.floors}</div>
            <div><strong>Parking:</strong> ${v.parking}</div>
            <div><strong>Amenities:</strong> ${v.amenities}</div>
            <div><strong>RERA:</strong> ${v.reraRegistration}</div>
            <div><strong>Builder:</strong> ${v.builderName}</div>
            <div><strong>Possession:</strong> ${formatPossessionMonthYear(v.possessionTime)}</div>
        </div>
        `;

        return `
        <div class="variant-card">
            <div class="variant-title" onclick="toggleAccordion(${i})">
                ${title}
                <span class="accordion-icon">+</span>
            </div>

            ${highlights}

            <div class="accordion-body" id="acc-${i}">
                ${details}
            </div>
        </div>
        `;
    }).join('');

    modalOverlay.classList.add('open');
}



// ---------- CLOSE MODAL ----------

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
}

// ---------- EMPTY ----------

function showEmptyState() {
    document.getElementById('loadingSkeleton').style.display = 'none';
    document.getElementById('propertyGrid').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

// ---------- RESET ----------

function resetAllFilters() {
    currentFilters = { city: '', locality: '', size: '', status: '', search: '' };

    document.getElementById('cityFilter').value = '';
    document.getElementById('localityFilter').value = '';
    document.getElementById('sizeFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('sortSelect').value = 'default';
    document.getElementById('searchInput').value = '';

    updateDependentFilters();
    applyFilters();
}

// ---------- EVENTS ----------

function initializeEventListeners() {

    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 50) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
    });

    document.getElementById('cityFilter').addEventListener('change', e => {
        currentFilters.city = e.target.value;
        updateDependentFilters();
        applyFilters();
    });

    document.getElementById('localityFilter').addEventListener('change', e => {
        currentFilters.locality = e.target.value;
        updateDependentFilters();
        applyFilters();
    });

    document.getElementById('sizeFilter').addEventListener('change', e => {
        currentFilters.size = e.target.value;
        updateDependentFilters();
        applyFilters();
    });

    document.getElementById('statusFilter').addEventListener('change', e => {
        currentFilters.status = e.target.value;
        updateDependentFilters();
        applyFilters();
    });

    document.getElementById('resetFiltersBtn').addEventListener('click', resetAllFilters);

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', e => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.search = e.target.value;
            applyFilters();
        }, 300);
    });

    document.getElementById('sortSelect').addEventListener('change', sortProperties);

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', e => {
        if (e.target.id === 'modalOverlay') closeModal();
    });

    // Load More click
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", () => {
            visibleCount += LOAD_STEP;
            renderProperties();
        });
    }

}

function toggleAccordion(i) {
    const body = document.getElementById(`acc-${i}`);
    const icon = body.previousElementSibling.querySelector('.accordion-icon');

    const open = body.classList.contains('open');

    document.querySelectorAll('.accordion-body').forEach(b => b.classList.remove('open'));
    document.querySelectorAll('.accordion-icon').forEach(ic => ic.textContent = '+');

    if (!open) {
        body.classList.add('open');
        icon.textContent = '−';
    }
}
