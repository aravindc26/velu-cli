function isObject(value) {
    return typeof value === "object" && value !== null;
}
function isSeparator(value) {
    return isObject(value) && typeof value.separator === "string";
}
function isLink(value) {
    return isObject(value) && typeof value.href === "string" && typeof value.label === "string";
}
function isGroupLike(value) {
    return isObject(value) && typeof value.group === "string";
}
function isMenuItem(value) {
    return isObject(value) && typeof value.item === "string";
}
function isTabLike(value) {
    return isObject(value) && typeof value.tab === "string";
}
function isAnchorLike(value) {
    return isObject(value) && typeof value.anchor === "string";
}
function isDropdownLike(value) {
    return isObject(value) && typeof value.dropdown === "string";
}
function isGroupEntry(value) {
    return typeof value === "object" && value !== null && "group" in value;
}
function slugify(input, fallback) {
    const slug = input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || fallback;
}
function uniqueSlug(base, used) {
    if (!used.has(base)) {
        used.add(base);
        return base;
    }
    let count = 2;
    while (used.has(`${base}-${count}`))
        count += 1;
    const candidate = `${base}-${count}`;
    used.add(candidate);
    return candidate;
}
function normalizeOpenApiValue(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(value)) {
        const items = value
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
        return items.length > 0 ? items : undefined;
    }
    if (isObject(value)) {
        const source = normalizeOpenApiValue(value.source);
        if (source === undefined || (typeof source === "object" && !Array.isArray(source)))
            return undefined;
        const rawDirectory = typeof value.directory === "string" ? value.directory.trim() : "";
        const directory = rawDirectory ? rawDirectory.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "") : undefined;
        return directory ? { source, directory } : { source };
    }
    return undefined;
}
function resolveOpenApiValue(local, inherited) {
    return normalizeOpenApiValue(local) ?? inherited;
}
function resolveVersionValue(local, inherited) {
    if (typeof local === "string") {
        const trimmed = local.trim();
        if (trimmed.length > 0)
            return trimmed;
    }
    return inherited;
}
function normalizeLink(value) {
    const out = { href: value.href, label: value.label };
    if (typeof value.icon === "string" && value.icon.length > 0)
        out.icon = value.icon;
    if (typeof value.iconType === "string" && value.iconType.length > 0)
        out.iconType = value.iconType;
    return out;
}
function normalizeAnchorLink(value) {
    const href = typeof value.href === "string" ? value.href : "#";
    const label = typeof value.anchor === "string" ? value.anchor : "Link";
    const icon = typeof value.icon === "string" ? value.icon : undefined;
    const iconType = typeof value.iconType === "string" ? value.iconType : undefined;
    const out = { href, label };
    if (icon)
        out.icon = icon;
    if (iconType)
        out.iconType = iconType;
    return out;
}
function hasContent(value) {
    const hasSimple = (Array.isArray(value.pages) && value.pages.length > 0) ||
        (Array.isArray(value.groups) && value.groups.length > 0) ||
        (Array.isArray(value.menu) && value.menu.length > 0) ||
        (Array.isArray(value.tabs) && value.tabs.length > 0) ||
        (Array.isArray(value.dropdowns) && value.dropdowns.length > 0) ||
        normalizeOpenApiValue(value.openapi) !== undefined ||
        normalizeOpenApiValue(value.asyncapi) !== undefined;
    const hasAnchors = Array.isArray(value.anchors) &&
        value.anchors.some((a) => isAnchorLike(a) &&
            ((Array.isArray(a.tabs) && a.tabs.length > 0) ||
                (Array.isArray(a.groups) && a.groups.length > 0) ||
                (Array.isArray(a.pages) && a.pages.length > 0) ||
                (Array.isArray(a.menu) && a.menu.length > 0) ||
                (Array.isArray(a.anchors) && a.anchors.length > 0) ||
                (Array.isArray(a.dropdowns) && a.dropdowns.length > 0)));
    return hasSimple || hasAnchors;
}
function normalizeGroup(rawGroup, usedGroupSlugs, inheritedOpenApi, inheritedVersion) {
    const groupName = typeof rawGroup.group === "string" ? rawGroup.group : "Group";
    const rawSlug = typeof rawGroup.slug === "string" ? rawGroup.slug : groupName;
    const groupSlug = uniqueSlug(slugify(rawSlug, "group"), usedGroupSlugs);
    const openapi = resolveOpenApiValue(rawGroup.openapi, inheritedOpenApi);
    const asyncapi = normalizeOpenApiValue(rawGroup.asyncapi);
    const version = resolveVersionValue(rawGroup.version, inheritedVersion);
    const childUsedSlugs = new Set();
    const pages = collectEntries(rawGroup, childUsedSlugs, openapi, version);
    const out = { group: groupName, slug: groupSlug, pages };
    if (typeof rawGroup.icon === "string")
        out.icon = rawGroup.icon;
    if (typeof rawGroup.iconType === "string")
        out.iconType = rawGroup.iconType;
    if (version !== undefined)
        out.version = version;
    if (typeof rawGroup.tag === "string")
        out.tag = rawGroup.tag;
    if (typeof rawGroup.expanded === "boolean")
        out.expanded = rawGroup.expanded;
    if (typeof rawGroup.description === "string")
        out.description = rawGroup.description;
    if (typeof rawGroup.hidden === "boolean")
        out.hidden = rawGroup.hidden;
    if (openapi !== undefined)
        out.openapi = openapi;
    if (asyncapi !== undefined)
        out.asyncapi = asyncapi;
    return out;
}
function normalizeMenuItem(rawItem, usedGroupSlugs, inheritedOpenApi, inheritedVersion) {
    const name = typeof rawItem.item === "string" ? rawItem.item : "Menu";
    const rawSlug = typeof rawItem.slug === "string" ? rawItem.slug : name;
    const slug = uniqueSlug(slugify(rawSlug, "menu"), usedGroupSlugs);
    const openapi = resolveOpenApiValue(rawItem.openapi, inheritedOpenApi);
    const asyncapi = normalizeOpenApiValue(rawItem.asyncapi);
    const version = resolveVersionValue(rawItem.version, inheritedVersion);
    const nestedGroupSlugs = new Set();
    const pages = collectEntries(rawItem, nestedGroupSlugs, openapi, version);
    const out = { group: name, slug, pages };
    if (typeof rawItem.icon === "string")
        out.icon = rawItem.icon;
    if (typeof rawItem.iconType === "string")
        out.iconType = rawItem.iconType;
    if (version !== undefined)
        out.version = version;
    if (openapi !== undefined)
        out.openapi = openapi;
    if (asyncapi !== undefined)
        out.asyncapi = asyncapi;
    return out;
}
function normalizeTabAsGroup(rawTab, usedGroupSlugs, inheritedOpenApi, inheritedVersion) {
    const tabName = typeof rawTab.tab === "string" ? rawTab.tab : "Tab";
    const rawSlug = typeof rawTab.slug === "string" ? rawTab.slug : tabName;
    const slug = uniqueSlug(slugify(rawSlug, "tab"), usedGroupSlugs);
    const openapi = resolveOpenApiValue(rawTab.openapi, inheritedOpenApi);
    const asyncapi = normalizeOpenApiValue(rawTab.asyncapi);
    const version = resolveVersionValue(rawTab.version, inheritedVersion);
    const nestedGroupSlugs = new Set();
    const pages = collectEntries(rawTab, nestedGroupSlugs, openapi, version);
    if (typeof rawTab.href === "string" && rawTab.href.length > 0 && !hasContent(rawTab)) {
        pages.push({
            href: rawTab.href,
            label: tabName,
            ...(typeof rawTab.icon === "string" ? { icon: rawTab.icon } : {}),
            ...(typeof rawTab.iconType === "string" ? { iconType: rawTab.iconType } : {}),
        });
    }
    const out = { group: tabName, slug, pages };
    if (typeof rawTab.icon === "string")
        out.icon = rawTab.icon;
    if (typeof rawTab.iconType === "string")
        out.iconType = rawTab.iconType;
    if (version !== undefined)
        out.version = version;
    if (openapi !== undefined)
        out.openapi = openapi;
    if (asyncapi !== undefined)
        out.asyncapi = asyncapi;
    return out;
}
function normalizeDropdownAsGroup(rawDropdown, usedGroupSlugs, inheritedOpenApi, inheritedVersion) {
    return normalizeTabAsGroup({
        tab: rawDropdown.dropdown,
        slug: rawDropdown.slug,
        icon: rawDropdown.icon,
        iconType: rawDropdown.iconType,
        version: rawDropdown.version,
        href: rawDropdown.href,
        groups: rawDropdown.groups,
        pages: rawDropdown.pages,
        menu: rawDropdown.menu,
        anchors: rawDropdown.anchors,
        dropdowns: rawDropdown.dropdowns,
        tabs: rawDropdown.tabs,
        openapi: rawDropdown.openapi,
        asyncapi: rawDropdown.asyncapi,
    }, usedGroupSlugs, inheritedOpenApi, inheritedVersion);
}
function normalizeAnchorAsGroup(rawAnchor, usedGroupSlugs, inheritedOpenApi, inheritedVersion) {
    const anchorName = typeof rawAnchor.anchor === "string" ? rawAnchor.anchor : "Anchor";
    const rawSlug = typeof rawAnchor.slug === "string" ? rawAnchor.slug : anchorName;
    const slug = uniqueSlug(slugify(rawSlug, "anchor"), usedGroupSlugs);
    const openapi = resolveOpenApiValue(rawAnchor.openapi, inheritedOpenApi);
    const asyncapi = normalizeOpenApiValue(rawAnchor.asyncapi);
    const version = resolveVersionValue(rawAnchor.version, inheritedVersion);
    const nestedGroupSlugs = new Set();
    const pages = collectEntries(rawAnchor, nestedGroupSlugs, openapi, version);
    const out = { group: anchorName, slug, pages };
    if (typeof rawAnchor.icon === "string")
        out.icon = rawAnchor.icon;
    if (typeof rawAnchor.iconType === "string")
        out.iconType = rawAnchor.iconType;
    if (version !== undefined)
        out.version = version;
    if (openapi !== undefined)
        out.openapi = openapi;
    if (asyncapi !== undefined)
        out.asyncapi = asyncapi;
    return out;
}
function collectEntries(rawSection, usedGroupSlugs, inheritedOpenApi, inheritedVersion) {
    const entries = [];
    const hasNonMenuContent = (Array.isArray(rawSection.groups) && rawSection.groups.length > 0) ||
        (Array.isArray(rawSection.pages) && rawSection.pages.length > 0) ||
        (Array.isArray(rawSection.anchors) && rawSection.anchors.length > 0) ||
        (Array.isArray(rawSection.dropdowns) && rawSection.dropdowns.length > 0) ||
        (Array.isArray(rawSection.tabs) && rawSection.tabs.length > 0);
    for (const item of Array.isArray(rawSection.menu) ? rawSection.menu : []) {
        if (hasNonMenuContent)
            break;
        if (isMenuItem(item))
            entries.push(normalizeMenuItem(item, usedGroupSlugs, inheritedOpenApi, inheritedVersion));
    }
    for (const group of Array.isArray(rawSection.groups) ? rawSection.groups : []) {
        if (isGroupLike(group))
            entries.push(normalizeGroup(group, usedGroupSlugs, inheritedOpenApi, inheritedVersion));
    }
    for (const item of Array.isArray(rawSection.pages) ? rawSection.pages : []) {
        if (typeof item === "string")
            entries.push(item);
        else if (isSeparator(item))
            entries.push({ separator: item.separator });
        else if (isLink(item))
            entries.push(normalizeLink(item));
        else if (isGroupLike(item))
            entries.push(normalizeGroup(item, usedGroupSlugs, inheritedOpenApi, inheritedVersion));
    }
    for (const anchor of Array.isArray(rawSection.anchors) ? rawSection.anchors : []) {
        if (!isAnchorLike(anchor))
            continue;
        const hrefOnly = typeof anchor.href === "string" && anchor.href.length > 0 && !hasContent(anchor);
        if (hrefOnly)
            entries.push(normalizeAnchorLink(anchor));
        else
            entries.push(normalizeAnchorAsGroup(anchor, usedGroupSlugs, inheritedOpenApi, inheritedVersion));
    }
    for (const dropdown of Array.isArray(rawSection.dropdowns) ? rawSection.dropdowns : []) {
        if (isDropdownLike(dropdown))
            entries.push(normalizeDropdownAsGroup(dropdown, usedGroupSlugs, inheritedOpenApi, inheritedVersion));
    }
    for (const tab of Array.isArray(rawSection.tabs) ? rawSection.tabs : []) {
        if (isTabLike(tab))
            entries.push(normalizeTabAsGroup(tab, usedGroupSlugs, inheritedOpenApi, inheritedVersion));
    }
    return entries;
}
function normalizeTab(rawTab, usedTabSlugs, slugPrefix, inheritedOpenApi, inheritedVersion) {
    const tabName = typeof rawTab.tab === "string" ? rawTab.tab : "Tab";
    const rawSlug = typeof rawTab.slug === "string" ? rawTab.slug : tabName;
    const tabSlugPart = slugify(rawSlug, "tab");
    const fullSlug = slugPrefix ? `${slugPrefix}/${tabSlugPart}` : tabSlugPart;
    const slug = uniqueSlug(fullSlug, usedTabSlugs);
    const openapi = resolveOpenApiValue(rawTab.openapi, inheritedOpenApi);
    const asyncapi = normalizeOpenApiValue(rawTab.asyncapi);
    const version = resolveVersionValue(rawTab.version, inheritedVersion);
    const out = { tab: tabName, slug };
    if (typeof rawTab.icon === "string")
        out.icon = rawTab.icon;
    if (typeof rawTab.iconType === "string")
        out.iconType = rawTab.iconType;
    if (version !== undefined)
        out.version = version;
    if (openapi !== undefined)
        out.openapi = openapi;
    if (asyncapi !== undefined)
        out.asyncapi = asyncapi;
    if (typeof rawTab.href === "string" && rawTab.href.length > 0 && !hasContent(rawTab)) {
        out.href = rawTab.href;
        return out;
    }
    const groupSlugSet = new Set();
    const entries = collectEntries(rawTab, groupSlugSet, openapi, version);
    const groups = [];
    const pages = [];
    for (const entry of entries) {
        if (isGroupEntry(entry))
            groups.push(entry);
        else
            pages.push(entry);
    }
    if (groups.length > 0)
        out.groups = groups;
    if (pages.length > 0)
        out.pages = pages;
    return out;
}
function normalizeDropdownToTab(rawDropdown, usedTabSlugs, slugPrefix, inheritedOpenApi, inheritedVersion) {
    return normalizeTab({
        tab: rawDropdown.dropdown,
        slug: rawDropdown.slug,
        icon: rawDropdown.icon,
        iconType: rawDropdown.iconType,
        version: rawDropdown.version,
        href: rawDropdown.href,
        groups: rawDropdown.groups,
        pages: rawDropdown.pages,
        menu: rawDropdown.menu,
        anchors: rawDropdown.anchors,
        dropdowns: rawDropdown.dropdowns,
        tabs: rawDropdown.tabs,
        openapi: rawDropdown.openapi,
        asyncapi: rawDropdown.asyncapi,
    }, usedTabSlugs, slugPrefix, inheritedOpenApi, inheritedVersion);
}
function normalizeTabList(rawTabs, usedTabSlugs, slugPrefix = "", inheritedOpenApi, inheritedVersion) {
    const tabs = [];
    for (const item of rawTabs) {
        if (isTabLike(item))
            tabs.push(normalizeTab(item, usedTabSlugs, slugPrefix, inheritedOpenApi, inheritedVersion));
    }
    return tabs;
}
function normalizeDropdownList(rawDropdowns, usedTabSlugs, slugPrefix = "", inheritedOpenApi, inheritedVersion) {
    const tabs = [];
    for (const item of rawDropdowns) {
        if (isDropdownLike(item))
            tabs.push(normalizeDropdownToTab(item, usedTabSlugs, slugPrefix, inheritedOpenApi, inheritedVersion));
    }
    if (inheritedOpenApi === undefined && inheritedVersion === undefined)
        return tabs;
    return tabs.map((tab) => ({ ...tab, openapi: tab.openapi ?? inheritedOpenApi, version: tab.version ?? inheritedVersion }));
}
function normalizeNavigationTabs(navigation, usedTabSlugs = new Set(), inheritedOpenApi) {
    if (!isObject(navigation))
        return [];
    const sectionOpenApi = resolveOpenApiValue(navigation.openapi, inheritedOpenApi);
    const tabs = [];
    tabs.push(...normalizeTabList(Array.isArray(navigation.tabs) ? navigation.tabs : [], usedTabSlugs, "", sectionOpenApi));
    tabs.push(...normalizeDropdownList(Array.isArray(navigation.dropdowns) ? navigation.dropdowns : [], usedTabSlugs, "", sectionOpenApi));
    if (Array.isArray(navigation.products)) {
        navigation.products.forEach((product, index) => {
            if (!isObject(product))
                return;
            const productName = typeof product.product === "string" ? product.product : `Product ${index + 1}`;
            const prefix = slugify(productName, `product-${index + 1}`);
            const productOpenApi = resolveOpenApiValue(product.openapi, sectionOpenApi);
            tabs.push(...normalizeTabList(Array.isArray(product.tabs) ? product.tabs : [], usedTabSlugs, prefix, productOpenApi));
            tabs.push(...normalizeDropdownList(Array.isArray(product.dropdowns) ? product.dropdowns : [], usedTabSlugs, prefix, productOpenApi));
            if (!Array.isArray(product.tabs) && !Array.isArray(product.dropdowns)) {
                if (hasContent(product)) {
                    tabs.push(normalizeTab({
                        tab: productName,
                        slug: prefix,
                        icon: product.icon,
                        iconType: product.iconType,
                        groups: product.groups,
                        pages: product.pages,
                        menu: product.menu,
                        anchors: product.anchors,
                        dropdowns: product.dropdowns,
                        tabs: product.tabs,
                        openapi: productOpenApi,
                        asyncapi: normalizeOpenApiValue(product.asyncapi),
                    }, usedTabSlugs, "", productOpenApi));
                }
                else if (typeof product.href === "string" && product.href.length > 0) {
                    tabs.push(normalizeTab({
                        tab: productName,
                        slug: prefix,
                        icon: product.icon,
                        iconType: product.iconType,
                        href: product.href,
                        openapi: productOpenApi,
                        asyncapi: normalizeOpenApiValue(product.asyncapi),
                    }, usedTabSlugs, "", productOpenApi));
                }
            }
        });
    }
    if (Array.isArray(navigation.versions)) {
        navigation.versions.forEach((version, index) => {
            if (!isObject(version))
                return;
            const versionName = typeof version.version === "string" ? version.version : `Version ${index + 1}`;
            const prefix = slugify(versionName, `version-${index + 1}`);
            const versionOpenApi = resolveOpenApiValue(version.openapi, sectionOpenApi);
            tabs.push(...normalizeTabList(Array.isArray(version.tabs) ? version.tabs : [], usedTabSlugs, prefix, versionOpenApi));
            tabs.push(...normalizeDropdownList(Array.isArray(version.dropdowns) ? version.dropdowns : [], usedTabSlugs, prefix, versionOpenApi));
            if (!Array.isArray(version.tabs) && !Array.isArray(version.dropdowns)) {
                if (hasContent(version)) {
                    tabs.push(normalizeTab({
                        tab: versionName,
                        slug: prefix,
                        groups: version.groups,
                        pages: version.pages,
                        menu: version.menu,
                        anchors: version.anchors,
                        dropdowns: version.dropdowns,
                        tabs: version.tabs,
                        openapi: versionOpenApi,
                        asyncapi: normalizeOpenApiValue(version.asyncapi),
                    }, usedTabSlugs, "", versionOpenApi));
                }
                else if (typeof version.href === "string" && version.href.length > 0) {
                    tabs.push(normalizeTab({
                        tab: versionName,
                        slug: prefix,
                        href: version.href,
                        openapi: versionOpenApi,
                        asyncapi: normalizeOpenApiValue(version.asyncapi),
                    }, usedTabSlugs, "", versionOpenApi));
                }
            }
        });
    }
    if (Array.isArray(navigation.anchors)) {
        navigation.anchors.forEach((anchor, index) => {
            if (!isAnchorLike(anchor))
                return;
            const anchorName = typeof anchor.anchor === "string" ? anchor.anchor : `Anchor ${index + 1}`;
            const prefix = slugify(anchorName, `anchor-${index + 1}`);
            const anchorOpenApi = resolveOpenApiValue(anchor.openapi, sectionOpenApi);
            const anchorVersion = resolveVersionValue(anchor.version);
            if (Array.isArray(anchor.tabs)) {
                tabs.push(...normalizeTabList(anchor.tabs, usedTabSlugs, prefix, anchorOpenApi, anchorVersion));
            }
            else if (hasContent(anchor)) {
                tabs.push(normalizeTab({
                    tab: anchorName,
                    slug: prefix,
                    icon: anchor.icon,
                    iconType: anchor.iconType,
                    version: anchorVersion,
                    groups: anchor.groups,
                    pages: anchor.pages,
                    menu: anchor.menu,
                    anchors: anchor.anchors,
                    dropdowns: anchor.dropdowns,
                    tabs: anchor.tabs,
                    openapi: anchorOpenApi,
                    asyncapi: normalizeOpenApiValue(anchor.asyncapi),
                }, usedTabSlugs, "", anchorOpenApi, anchorVersion));
            }
        });
    }
    const hasRootGroups = Array.isArray(navigation.groups) && navigation.groups.length > 0;
    const hasRootPages = Array.isArray(navigation.pages) && navigation.pages.length > 0;
    const hasRootMenu = Array.isArray(navigation.menu) && navigation.menu.length > 0;
    if (tabs.length === 0 && (hasRootGroups || hasRootPages || hasRootMenu)) {
        tabs.push(normalizeTab({
            tab: "Documentation",
            slug: "documentation",
            groups: navigation.groups,
            pages: navigation.pages,
            menu: navigation.menu,
            anchors: navigation.anchors,
            dropdowns: navigation.dropdowns,
            tabs: navigation.tabs,
            openapi: sectionOpenApi,
            asyncapi: normalizeOpenApiValue(navigation.asyncapi),
        }, usedTabSlugs, "", sectionOpenApi));
    }
    return tabs;
}
function normalizeLanguageEntries(languages, inheritedOpenApi) {
    if (!Array.isArray(languages))
        return [];
    return languages
        .filter(isObject)
        .map((entry) => {
        const usedTabSlugs = new Set();
        const languageOpenApi = resolveOpenApiValue(entry.openapi, inheritedOpenApi);
        return {
            ...entry,
            tabs: normalizeNavigationTabs(entry, usedTabSlugs, languageOpenApi),
        };
    });
}
export function normalizeConfigNavigation(config) {
    const nav = isObject(config.navigation) ? config.navigation : {};
    const navOpenApi = resolveOpenApiValue(nav.openapi);
    const navAsyncApi = normalizeOpenApiValue(nav.asyncapi);
    return {
        ...config,
        navigation: {
            ...nav,
            ...(navOpenApi !== undefined ? { openapi: navOpenApi } : {}),
            ...(navAsyncApi !== undefined ? { asyncapi: navAsyncApi } : {}),
            tabs: normalizeNavigationTabs(nav, new Set(), navOpenApi),
            languages: normalizeLanguageEntries(nav.languages, navOpenApi),
            products: Array.isArray(nav.products) ? nav.products : [],
            versions: Array.isArray(nav.versions) ? nav.versions : [],
        },
    };
}
