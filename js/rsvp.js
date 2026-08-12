const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxqHKMZi7pr1dzpmq0VmrRN01ELMwa5I6rRVxWWcxR19wrrrBmEg0Pgs-bGaV5XW-Hl/exec';
const CONTACT_EMAIL = 'will.and.christy.wedding@gmail.com';

const sections = {
    lookup: document.getElementById('lookup-section'),
    form: document.getElementById('form-section'),
    already: document.getElementById('already-section'),
    confirmation: document.getElementById('confirmation-section'),
};

const lookupForm = document.getElementById('lookup-form');
const lookupInput = document.getElementById('lookup-name');
const lookupButton = document.getElementById('lookup-button');
const lookupError = document.getElementById('lookup-error');

const rsvpForm = document.getElementById('rsvp-form');
const formGreeting = document.getElementById('form-greeting');
const submitButton = document.getElementById('submit-button');
const submitError = document.getElementById('submit-error');
const noteField = document.getElementById('rsvp-note');

const receptionContainer = document.getElementById('reception-people');
const welcomeContainer = document.getElementById('welcome-people');
const welcomeEvent = document.getElementById('welcome-event');
const brunchContainer = document.getElementById('brunch-people');

const backToLookup = document.getElementById('back-to-lookup');

let currentHousehold = null;

function showSection(name) {
    Object.entries(sections).forEach(([key, el]) => {
        if (key === name) {
            el.removeAttribute('hidden');
        } else {
            el.setAttribute('hidden', '');
        }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showInlineError(el, message) {
    el.textContent = message;
    el.removeAttribute('hidden');
}

function hideInlineError(el) {
    el.textContent = '';
    el.setAttribute('hidden', '');
}

async function postToScript(payload) {
    const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        console.log({response})
        console.log(('Server responded with ' + response.status))
        //throw new Error('Server responded with ' + response.status);
    }
    return response.json();
}

function buildPersonRow(role, displayName, slot) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rsvp-person';

    const nameEl = document.createElement('span');
    nameEl.className = 'rsvp-person-name';
    nameEl.textContent = displayName;
    wrapper.appendChild(nameEl);

    const choices = document.createElement('div');
    choices.className = 'rsvp-choices';

    ['yes', 'no'].forEach(value => {
        const id = `${role}-${slot}-${value}`;
        const label = document.createElement('label');
        label.className = 'rsvp-choice';
        label.setAttribute('for', id);

        const input = document.createElement('input');
        input.type = 'radio';
        input.id = id;
        input.name = `${role}-${slot}`;
        input.value = value;
        input.required = true;

        const text = document.createElement('span');
        text.textContent = value === 'yes' ? 'Will attend' : 'Cannot attend';

        label.appendChild(input);
        label.appendChild(text);
        choices.appendChild(label);
    });

    wrapper.appendChild(choices);
    return wrapper;
}

function renderForm(household) {
    const { primary, secondary, welcomeInvited } = household;

    formGreeting.textContent = secondary
        ? `Hi ${primary} & ${secondary}`
        : `Hi ${primary}`;

    receptionContainer.innerHTML = '';
    welcomeContainer.innerHTML = '';
    brunchContainer.innerHTML = '';

    receptionContainer.appendChild(buildPersonRow('reception', primary, 'primary'));
    brunchContainer.appendChild(buildPersonRow('brunch', primary, 'primary'));
    if (secondary) {
        receptionContainer.appendChild(buildPersonRow('reception', secondary, 'secondary'));
        brunchContainer.appendChild(buildPersonRow('brunch', secondary, 'secondary'));
    }

    if (welcomeInvited) {
        welcomeContainer.appendChild(buildPersonRow('welcome', primary, 'primary'));
        if (secondary) {
            welcomeContainer.appendChild(buildPersonRow('welcome', secondary, 'secondary'));
        }
        welcomeEvent.removeAttribute('hidden');
    } else {
        welcomeEvent.setAttribute('hidden', '');
    }

    noteField.value = '';
    hideInlineError(submitError);
}

function readChoice(name) {
    const selected = rsvpForm.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : null;
}

function validateForm(household) {
    const required = [
        ['reception-primary', household.primary],
    ];
    if (household.secondary) required.push(['reception-secondary', household.secondary]);
    required.push(['brunch-primary', household.primary]);
    if (household.secondary) required.push(['brunch-secondary', household.secondary]);
    if (household.welcomeInvited) {
        required.push(['welcome-primary', household.primary]);
        if (household.secondary) required.push(['welcome-secondary', household.secondary]);
    }

    for (const [field, person] of required) {
        if (!readChoice(field)) {
            return `Please select an answer for ${person}.`;
        }
    }
    return null;
}

lookupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideInlineError(lookupError);
    const name = lookupInput.value.trim();
    if (!name) {
        showInlineError(lookupError, 'Please enter a name.');
        return;
    }

    lookupButton.disabled = true;
    lookupButton.textContent = 'Searching...';

    try {
        const result = await postToScript({ action: 'lookup', name });
        if (!result.found) {
            showInlineError(
                lookupError,
                result.ambiguous
                    ? `We found more than one guest by that name. Please email ${CONTACT_EMAIL} and we'll get you sorted.`
                    : `We couldn't find that name. Try the name exactly as it appears on your invitation, or email ${CONTACT_EMAIL}.`
            );
            return;
        }
        currentHousehold = result;
        if (result.alreadySubmitted) {
            showSection('already');
            return;
        }
        renderForm(result);
        showSection('form');
    } catch (err) {
        showInlineError(
            lookupError,
            `Something went wrong. Please try again, or email ${CONTACT_EMAIL}.`
        );
    } finally {
        lookupButton.disabled = false;
        lookupButton.textContent = 'Find my invitation';
    }
});

rsvpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideInlineError(submitError);

    if (!currentHousehold) {
        showSection('lookup');
        return;
    }

    const validationError = validateForm(currentHousehold);
    if (validationError) {
        showInlineError(submitError, validationError);
        return;
    }

    const payload = {
        action: 'submit',
        rowIndex: currentHousehold.rowIndex,
        primaryName: currentHousehold.primary,
        responses: {
            receptionPrimary: readChoice('reception-primary'),
            receptionSecondary: readChoice('reception-secondary'),
            welcomePrimary: readChoice('welcome-primary'),
            welcomeSecondary: readChoice('welcome-secondary'),
            brunchPrimary: readChoice('brunch-primary'),
            brunchSecondary: readChoice('brunch-secondary'),
        },
        note: noteField.value.trim(),
    };

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    try {
        const result = await postToScript(payload);
        if (result.alreadySubmitted) {
            showSection('already');
            return;
        }
        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }
        showSection('confirmation');
    } catch (err) {
        showInlineError(
            submitError,
            `Something went wrong submitting your RSVP. Please try again, or email ${CONTACT_EMAIL}.`
        );
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit RSVP';
    }
});

backToLookup.addEventListener('click', (e) => {
    e.preventDefault();
    currentHousehold = null;
    lookupInput.value = '';
    hideInlineError(lookupError);
    showSection('lookup');
});
