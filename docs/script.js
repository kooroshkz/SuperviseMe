// Global variables
let professorsData = {};
let clustersData = {};
let filteredData = {};
let currentFilter = 'all';

// Graph variables
let graphData = { nodes: [], links: [] };
let simulation;
let svg, g;
let tooltip;

// DOM elements
const loadingOverlay = document.getElementById('loadingOverlay');
const clustersGrid = document.getElementById('clustersGrid');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');
const professorModal = document.getElementById('professorModal');
const modalClose = document.getElementById('modalClose');

// Graph elements
const resetGraphBtn = document.getElementById('resetGraphBtn');
const expandAllBtn = document.getElementById('expandAllBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');
const graphTooltip = document.getElementById('graphTooltip');

// Stats elements
const totalProfessorsEl = document.getElementById('totalProfessors');
const totalClustersEl = document.getElementById('totalClusters');
const totalSubcategoriesEl = document.getElementById('totalSubcategories');

// Modal elements
const modalProfessorName = document.getElementById('modalProfessorName');
const modalResearchAreas = document.getElementById('modalResearchAreas');
const modalAnalysisSummary = document.getElementById('modalAnalysisSummary');
const modalThesisCount = document.getElementById('modalThesisCount');
const modalTimestamp = document.getElementById('modalTimestamp');

// Color palette for research areas
const researchAreaColors = {
    'Theory': '#8b5cf6',
    'Natural computing': '#10b981',
    'Machine learning': '#3b82f6',
    'Data science': '#f59e0b',
    'Software': '#ef4444',
    'Business': '#8b5a2b',
    'Systems': '#6b7280',
    'Security': '#dc2626',
    'Human-aligned AI': '#ec4899',
    'Bioinformatics': '#059669',
    'Programming Education': '#7c3aed',
    'Methods': '#0891b2',
    'Statistics': '#ea580c',
    'Cognitive Psychology': '#be185d'
};

// Initialize the application
async function initializeApp() {
    try {
        showLoading();
        await loadData();
        
        // Check if we actually loaded data
        if (!professorsData || Object.keys(professorsData).length === 0) {
            throw new Error('No professor data loaded');
        }
        
        processData();
        updateStats();
        renderClusters();
        initializeGraph();
        setupEventListeners();
        hideLoading();
        
        // Add fade-in animation to main content
        document.querySelector('.main-content').classList.add('fade-in');
    } catch (error) {
        console.error('Error initializing app:', error);
        hideLoading();
        showError('Failed to load data. Please ensure you\'re running this from a web server (try: python -m http.server 8000)');
    }
}

// Load the JSON data
async function loadData() {
    try {
        // Try different paths for the JSON file
        let response;
        try {
            response = await fetch('./final_results_llm.json');
        } catch {
            response = await fetch('final_results_llm.json');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        professorsData = await response.json();
    } catch (error) {
        console.error('Error loading data:', error);
        // For local development, try to load from a different path
        try {
            const response = await fetch('/Users/kooroshkz/Desktop/SuperviseMe/final_results_llm.json');
            if (response.ok) {
                professorsData = await response.json();
                return;
            }
        } catch {}
        throw error;
    }
}

// Process and organize the data
function processData() {
    clustersData = {};
    
    // Process each professor
    Object.keys(professorsData).forEach(professorKey => {
        const professor = professorsData[professorKey];
        
        // Skip if no research areas
        if (!professor.primary_research_areas || professor.primary_research_areas.length === 0) {
            return;
        }
        
        // Process each research area
        professor.primary_research_areas.forEach(area => {
            const clusterName = area.top_level;
            
            // Initialize cluster if it doesn't exist
            if (!clustersData[clusterName]) {
                clustersData[clusterName] = {
                    name: clusterName,
                    professors: [],
                    subcategories: new Set(),
                    totalProfessors: 0,
                    highConfidence: 0,
                    mediumConfidence: 0
                };
            }
            
            // Add professor to cluster
            const professorInfo = {
                name: professor.professor_name,
                confidence: area.confidence,
                evidenceCount: area.evidence_count,
                subcategories: area.subcategories || [],
                analysisSummary: professor.analysis_summary,
                thesisCount: professor.processing_info?.thesis_count || 0,
                timestamp: professor.processing_timestamp || professor.processing_info?.timestamp
            };
            
            clustersData[clusterName].professors.push(professorInfo);
            
            // Add subcategories
            if (area.subcategories) {
                area.subcategories.forEach(sub => {
                    clustersData[clusterName].subcategories.add(sub);
                });
            }
            
            // Count confidence levels
            if (area.confidence === 'high') {
                clustersData[clusterName].highConfidence++;
            } else if (area.confidence === 'medium') {
                clustersData[clusterName].mediumConfidence++;
            }
        });
    });
    
    // Convert Sets to Arrays and sort
    Object.keys(clustersData).forEach(clusterName => {
        clustersData[clusterName].subcategories = Array.from(clustersData[clusterName].subcategories).sort();
        clustersData[clusterName].totalProfessors = clustersData[clusterName].professors.length;
        
        // Sort professors by confidence and evidence count
        clustersData[clusterName].professors.sort((a, b) => {
            if (a.confidence !== b.confidence) {
                return a.confidence === 'high' ? -1 : 1;
            }
            return b.evidenceCount - a.evidenceCount;
        });
    });
    
    // Initialize filtered data
    filteredData = { ...clustersData };
}

// Update statistics
function updateStats() {
    const totalProfs = Object.keys(professorsData).length;
    const totalClusters = Object.keys(clustersData).length;
    const totalSubcats = Object.values(clustersData)
        .reduce((total, cluster) => total + cluster.subcategories.length, 0);
    
    animateNumber(totalProfessorsEl, totalProfs);
    animateNumber(totalClustersEl, totalClusters);
    animateNumber(totalSubcategoriesEl, totalSubcats);
}

// Animate number counting
function animateNumber(element, target) {
    const start = 0;
    const duration = 1000;
    const startTime = Date.now();
    
    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor(start + (target - start) * progress);
        
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Render clusters
function renderClusters() {
    clustersGrid.innerHTML = '';
    
    const sortedClusters = Object.values(filteredData).sort((a, b) => b.totalProfessors - a.totalProfessors);
    
    sortedClusters.forEach((cluster, index) => {
        const clusterCard = createClusterCard(cluster, index);
        clustersGrid.appendChild(clusterCard);
    });
}

// Create cluster card
function createClusterCard(cluster, index) {
    const card = document.createElement('div');
    card.className = 'cluster-card slide-up';
    card.style.animationDelay = `${index * 100}ms`;
    
    const color = researchAreaColors[cluster.name] || '#6b7280';
    
    card.innerHTML = `
        <div class="cluster-header" style="background: linear-gradient(135deg, ${color} 0%, ${adjustBrightness(color, -20)} 100%);">
            <h3 class="cluster-title">${cluster.name}</h3>
            <div class="cluster-stats">
                <span><i class="fas fa-users"></i> ${cluster.totalProfessors} professors</span>
                <span><i class="fas fa-tags"></i> ${cluster.subcategories.length} subcategories</span>
            </div>
        </div>
        <div class="cluster-body">
            <div class="subcategories-section">
                <h4 class="subcategories-title">Research Subcategories</h4>
                <div class="subcategories-list">
                    ${cluster.subcategories.slice(0, 8).map(sub => `
                        <span class="subcategory-tag">${sub}</span>
                    `).join('')}
                    ${cluster.subcategories.length > 8 ? `<span class="subcategory-tag">+${cluster.subcategories.length - 8} more</span>` : ''}
                </div>
            </div>
            <div class="professors-section">
                <div class="professors-title">
                    <span><i class="fas fa-graduation-cap"></i> Faculty Members</span>
                    <span class="professor-count">${cluster.totalProfessors}</span>
                </div>
                <div class="professors-list">
                    ${cluster.professors.map(prof => `
                        <div class="professor-item" onclick="showProfessorModal('${prof.name.replace(/'/g, "\\'")}')">
                            <div class="professor-info">
                                <div class="professor-name">${prof.name}</div>
                                <div class="professor-areas">${prof.subcategories.slice(0, 2).join(', ')}${prof.subcategories.length > 2 ? '...' : ''}</div>
                            </div>
                            <span class="confidence-badge confidence-${prof.confidence}">${prof.confidence}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    return card;
}

// Show professor modal
function showProfessorModal(professorName) {
    const professor = professorsData[professorName];
    if (!professor) return;
    
    modalProfessorName.textContent = professor.professor_name;
    modalAnalysisSummary.textContent = professor.analysis_summary || 'No analysis summary available.';
    modalThesisCount.textContent = professor.processing_info?.thesis_count || 0;
    
    // Format timestamp
    const timestamp = professor.processing_timestamp || professor.processing_info?.timestamp;
    if (timestamp) {
        const date = new Date(timestamp);
        modalTimestamp.textContent = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } else {
        modalTimestamp.textContent = 'Unknown';
    }
    
    // Render research areas
    modalResearchAreas.innerHTML = '';
    if (professor.primary_research_areas && professor.primary_research_areas.length > 0) {
        professor.primary_research_areas.forEach(area => {
            const areaElement = createResearchAreaElement(area);
            modalResearchAreas.appendChild(areaElement);
        });
    } else {
        modalResearchAreas.innerHTML = '<p>No research areas classified.</p>';
    }
    
    professorModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Create research area element for modal
function createResearchAreaElement(area) {
    const element = document.createElement('div');
    element.className = 'research-area-item';
    
    const color = researchAreaColors[area.top_level] || '#6b7280';
    element.style.borderLeftColor = color;
    
    element.innerHTML = `
        <div class="research-area-header">
            <h4 class="research-area-title">${area.top_level}</h4>
            <div class="research-area-meta">
                <span class="confidence-badge confidence-${area.confidence}">${area.confidence}</span>
                <span class="evidence-count">${area.evidence_count} evidence</span>
            </div>
        </div>
        ${area.subcategories && area.subcategories.length > 0 ? `
            <div class="research-subcategories">
                ${area.subcategories.map(sub => `
                    <span class="research-subcategory">${sub}</span>
                `).join('')}
            </div>
        ` : ''}
    `;
    
    return element;
}

// Close modal
function closeProfessorModal() {
    professorModal.classList.remove('active');
    document.body.style.overflow = '';
}

// Filter clusters by confidence
function filterByConfidence(confidence) {
    currentFilter = confidence;
    
    // Update filter buttons
    filterButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.confidence === confidence);
    });
    
    if (confidence === 'all') {
        filteredData = { ...clustersData };
    } else {
        filteredData = {};
        Object.keys(clustersData).forEach(clusterName => {
            const cluster = clustersData[clusterName];
            const filteredProfessors = cluster.professors.filter(prof => prof.confidence === confidence);
            
            if (filteredProfessors.length > 0) {
                filteredData[clusterName] = {
                    ...cluster,
                    professors: filteredProfessors,
                    totalProfessors: filteredProfessors.length
                };
            }
        });
    }
    
    // Apply search filter if active
    if (searchInput.value.trim()) {
        filterBySearch(searchInput.value.trim());
    } else {
        renderClusters();
    }
}

// Filter by search
function filterBySearch(searchTerm) {
    const term = searchTerm.toLowerCase();
    const searchFilteredData = {};
    
    Object.keys(filteredData).forEach(clusterName => {
        const cluster = filteredData[clusterName];
        
        // Check if cluster name matches
        const clusterMatches = cluster.name.toLowerCase().includes(term);
        
        // Check if any subcategory matches
        const subcategoryMatches = cluster.subcategories.some(sub => 
            sub.toLowerCase().includes(term)
        );
        
        // Filter professors by name or subcategories
        const matchingProfessors = cluster.professors.filter(prof => {
            const nameMatches = prof.name.toLowerCase().includes(term);
            const profSubcatMatches = prof.subcategories.some(sub => 
                sub.toLowerCase().includes(term)
            );
            return nameMatches || profSubcatMatches;
        });
        
        // Include cluster if it matches or has matching professors
        if (clusterMatches || subcategoryMatches || matchingProfessors.length > 0) {
            searchFilteredData[clusterName] = {
                ...cluster,
                professors: clusterMatches || subcategoryMatches ? cluster.professors : matchingProfessors,
                totalProfessors: clusterMatches || subcategoryMatches ? cluster.totalProfessors : matchingProfessors.length
            };
        }
    });
    
    // Temporarily update filtered data for rendering
    const originalFilteredData = { ...filteredData };
    filteredData = searchFilteredData;
    renderClusters();
    
    // Restore original filtered data
    filteredData = originalFilteredData;
}

// Setup event listeners
function setupEventListeners() {
    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterByConfidence(btn.dataset.confidence);
        });
    });
    
    // Search input
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim();
        if (searchTerm) {
            filterBySearch(searchTerm);
        } else {
            renderClusters();
        }
    });
    
    // Modal close
    modalClose.addEventListener('click', closeProfessorModal);
    
    // Close modal on overlay click
    professorModal.addEventListener('click', (e) => {
        if (e.target === professorModal) {
            closeProfessorModal();
        }
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && professorModal.classList.contains('active')) {
            closeProfessorModal();
        }
    });
}

// Utility functions
function adjustBrightness(color, amount) {
    const usePound = color.charAt(0) === '#';
    const col = usePound ? color.slice(1) : color;
    const num = parseInt(col, 16);
    let r = (num >> 16) + amount;
    let g = (num >> 8 & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    
    return (usePound ? '#' : '') + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 300);
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ef4444;
        color: white;
        padding: 1rem 2rem;
        border-radius: 0.5rem;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        z-index: 3000;
        font-weight: 500;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Smooth scrolling for internal links
document.addEventListener('click', (e) => {
    if (e.target.matches('a[href^="#"]')) {
        e.preventDefault();
        const target = document.querySelector(e.target.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
});

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Add some performance optimizations
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounce search input
const debouncedSearch = debounce((searchTerm) => {
    if (searchTerm) {
        filterBySearch(searchTerm);
    } else {
        renderClusters();
    }
}, 300);

// Update search event listener to use debounced version
searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value.trim());
});

// Add intersection observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);

// Observe elements when they're added to the DOM
function observeElements() {
    const cards = document.querySelectorAll('.cluster-card');
    cards.forEach(card => observer.observe(card));
}

// ==================== INTERACTIVE GRAPH FUNCTIONALITY ====================

// Initialize the interactive graph
function initializeGraph() {
    svg = d3.select("#clusterGraph");
    tooltip = d3.select("#graphTooltip");
    
    // Get container dimensions
    const container = document.querySelector('.graph-wrapper');
    const width = container.clientWidth;
    const height = 600;
    
    svg.attr("width", width).attr("height", height);
    
    // Create main group for zoom/pan
    g = svg.append("g");
    
    // Setup zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });
    
    svg.call(zoom);
    
    // Initialize force simulation
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(80))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(30));
    
    // Generate initial graph data
    generateGraphData();
    updateGraph();
    
    // Setup graph event listeners
    setupGraphEventListeners();
}

// Generate graph data from clusters data
function generateGraphData() {
    const nodes = [];
    const links = [];
    
    // Add cluster nodes (main research areas)
    Object.keys(clustersData).forEach(clusterName => {
        const cluster = clustersData[clusterName];
        nodes.push({
            id: `cluster_${clusterName}`,
            name: clusterName,
            type: 'cluster',
            size: Math.max(20, Math.min(40, cluster.totalProfessors * 2)),
            professorsCount: cluster.totalProfessors,
            subcategoriesCount: cluster.subcategories.length,
            expanded: false,
            cluster: clusterName
        });
    });
    
    graphData = { nodes, links };
}

// Update the graph visualization
function updateGraph() {
    // Remove existing elements
    g.selectAll(".graph-link").remove();
    g.selectAll(".node-group").remove();
    
    // Add links
    const link = g.selectAll(".graph-link")
        .data(graphData.links)
        .enter().append("line")
        .attr("class", "graph-link");
    
    // Add nodes
    const nodeGroup = g.selectAll(".node-group")
        .data(graphData.nodes)
        .enter().append("g")
        .attr("class", "node-group")
        .call(d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded));
    
    // Add node circles
    nodeGroup.append("circle")
        .attr("class", d => `${d.type}-node`)
        .attr("r", d => d.size)
        .on("click", handleNodeClick)
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);
    
    // Add node labels
    nodeGroup.append("text")
        .attr("class", d => `node-label ${d.type}-label`)
        .attr("dy", d => d.size + 15)
        .text(d => {
            if (d.name.length > 12) {
                return d.name.substring(0, 12) + "...";
            }
            return d.name;
        });
    
    // Update simulation
    simulation.nodes(graphData.nodes);
    simulation.force("link").links(graphData.links);
    
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        
        nodeGroup
            .attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
    
    simulation.restart();
}

// Handle node click events
function handleNodeClick(event, d) {
    event.stopPropagation();
    
    if (d.type === 'cluster') {
        if (d.expanded) {
            collapseCluster(d);
        } else {
            expandCluster(d);
        }
    } else if (d.type === 'subcategory') {
        if (d.expanded) {
            collapseSubcategory(d);
        } else {
            expandSubcategory(d);
        }
    } else if (d.type === 'professor') {
        showProfessorModal(d.originalName);
    }
    
    updateGraph();
}

// Expand cluster to show subcategories
function expandCluster(clusterNode) {
    const cluster = clustersData[clusterNode.cluster];
    clusterNode.expanded = true;
    
    // Add subcategory nodes
    cluster.subcategories.forEach((subcategory, index) => {
        const subcatId = `subcat_${clusterNode.cluster}_${subcategory}`;
        
        // Check if subcategory node already exists
        if (!graphData.nodes.find(n => n.id === subcatId)) {
            const professorsInSubcat = cluster.professors.filter(prof => 
                prof.subcategories.includes(subcategory)
            );
            
            graphData.nodes.push({
                id: subcatId,
                name: subcategory,
                type: 'subcategory',
                size: Math.max(8, Math.min(20, professorsInSubcat.length * 1.5)),
                professorsCount: professorsInSubcat.length,
                expanded: false,
                cluster: clusterNode.cluster,
                subcategory: subcategory,
                professors: professorsInSubcat
            });
            
            // Add link from cluster to subcategory
            graphData.links.push({
                source: clusterNode.id,
                target: subcatId
            });
        }
    });
}

// Collapse cluster (remove subcategories and professors)
function collapseCluster(clusterNode) {
    clusterNode.expanded = false;
    
    // Remove subcategory and professor nodes
    graphData.nodes = graphData.nodes.filter(node => 
        node.cluster !== clusterNode.cluster || node.type === 'cluster'
    );
    
    // Remove related links
    graphData.links = graphData.links.filter(link => {
        const sourceNode = typeof link.source === 'object' ? link.source : 
            graphData.nodes.find(n => n.id === link.source);
        const targetNode = typeof link.target === 'object' ? link.target : 
            graphData.nodes.find(n => n.id === link.target);
        
        return sourceNode && targetNode && 
               sourceNode.cluster === clusterNode.cluster && 
               targetNode.cluster === clusterNode.cluster ? false : true;
    });
}

// Expand subcategory to show professors
function expandSubcategory(subcatNode) {
    subcatNode.expanded = true;
    
    // Add professor nodes
    subcatNode.professors.forEach(professor => {
        const profId = `prof_${subcatNode.cluster}_${subcatNode.subcategory}_${professor.name}`;
        
        // Check if professor node already exists
        if (!graphData.nodes.find(n => n.id === profId)) {
            graphData.nodes.push({
                id: profId,
                name: professor.name.split(' ').slice(-1)[0], // Last name only
                originalName: professor.name,
                type: 'professor',
                size: 6,
                confidence: professor.confidence,
                evidenceCount: professor.evidenceCount,
                thesisCount: professor.thesisCount,
                cluster: subcatNode.cluster,
                subcategory: subcatNode.subcategory
            });
            
            // Add link from subcategory to professor
            graphData.links.push({
                source: subcatNode.id,
                target: profId
            });
        }
    });
}

// Collapse subcategory (remove professors)
function collapseSubcategory(subcatNode) {
    subcatNode.expanded = false;
    
    // Remove professor nodes for this subcategory
    graphData.nodes = graphData.nodes.filter(node => 
        !(node.cluster === subcatNode.cluster && 
          node.subcategory === subcatNode.subcategory && 
          node.type === 'professor')
    );
    
    // Remove related links
    graphData.links = graphData.links.filter(link => {
        const targetNode = typeof link.target === 'object' ? link.target : 
            graphData.nodes.find(n => n.id === link.target);
        
        return !(targetNode && 
                targetNode.cluster === subcatNode.cluster && 
                targetNode.subcategory === subcatNode.subcategory && 
                targetNode.type === 'professor');
    });
}

// Expand all clusters and subcategories
function expandAll() {
    graphData.nodes.forEach(node => {
        if (node.type === 'cluster' && !node.expanded) {
            expandCluster(node);
        }
    });
    
    // Expand subcategories
    graphData.nodes.forEach(node => {
        if (node.type === 'subcategory' && !node.expanded) {
            expandSubcategory(node);
        }
    });
    
    updateGraph();
}

// Collapse all to show only main clusters
function collapseAll() {
    // Reset graph to only clusters
    generateGraphData();
    updateGraph();
}

// Reset graph view (center and reset zoom)
function resetGraphView() {
    const container = document.querySelector('.graph-wrapper');
    const width = container.clientWidth;
    const height = 600;
    
    svg.transition()
        .duration(750)
        .call(
            d3.zoom().transform,
            d3.zoomIdentity.translate(0, 0).scale(1)
        );
    
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    simulation.restart();
}

// Tooltip functions
function showTooltip(event, d) {
    let content = `<strong>${d.name}</strong><br>`;
    
    if (d.type === 'cluster') {
        content += `${d.professorsCount} professors<br>`;
        content += `${d.subcategoriesCount} subcategories<br>`;
        content += `Click to ${d.expanded ? 'collapse' : 'expand'}`;
    } else if (d.type === 'subcategory') {
        content += `${d.professorsCount} professors<br>`;
        content += `Click to ${d.expanded ? 'collapse' : 'expand'}`;
    } else if (d.type === 'professor') {
        content += `Confidence: ${d.confidence}<br>`;
        content += `Evidence: ${d.evidenceCount}<br>`;
        content += `Theses: ${d.thesisCount}<br>`;
        content += `Click for details`;
    }
    
    tooltip.html(content)
        .classed('visible', true);
    
    moveTooltip(event);
}

function moveTooltip(event) {
    const container = document.querySelector('.graph-wrapper');
    const rect = container.getBoundingClientRect();
    
    tooltip
        .style('left', (event.pageX - rect.left) + 'px')
        .style('top', (event.pageY - rect.top - 10) + 'px');
}

function hideTooltip() {
    tooltip.classed('visible', false);
}

// Drag functions
function dragStarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
}

function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
}

function dragEnded(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
}

// Setup graph event listeners
function setupGraphEventListeners() {
    resetGraphBtn.addEventListener('click', () => {
        resetGraphView();
        updateGraphButtonStates('reset');
    });
    
    expandAllBtn.addEventListener('click', () => {
        expandAll();
        updateGraphButtonStates('expand');
    });
    
    collapseAllBtn.addEventListener('click', () => {
        collapseAll();
        updateGraphButtonStates('collapse');
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        const container = document.querySelector('.graph-wrapper');
        const width = container.clientWidth;
        const height = 600;
        
        svg.attr("width", width);
        simulation.force("center", d3.forceCenter(width / 2, height / 2));
        simulation.restart();
    });
}

// Update button states
function updateGraphButtonStates(activeButton) {
    document.querySelectorAll('.graph-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (activeButton === 'reset') {
        resetGraphBtn.classList.add('active');
    } else if (activeButton === 'expand') {
        expandAllBtn.classList.add('active');
    } else if (activeButton === 'collapse') {
        collapseAllBtn.classList.add('active');
    }
}