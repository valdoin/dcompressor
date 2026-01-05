const video = document.getElementById('preview');
const slider = document.getElementById('slider');
const fileInput = document.getElementById('videoFile');
const fileLabel = document.getElementById('fileLabel');
const timeDisplay = document.getElementById('timeDisplay');
const startVal = document.getElementById('startVal');
const endVal = document.getElementById('endVal');
const durationVal = document.getElementById('durationVal');

let isSliderCreated = false;

function createSlider(duration) {
    if (isSliderCreated) {
        slider.noUiSlider.destroy();
    }
    
    noUiSlider.create(slider, {
        start: [0, duration],
        connect: true,
        range: { 'min': 0, 'max': duration },
        step: 0.1,
        behaviour: 'drag',
    });

    isSliderCreated = true;
    slider.style.display = 'block';
    timeDisplay.style.display = 'flex';

    slider.noUiSlider.on('slide', function (values, handle) {
        const time = parseFloat(values[handle]);
        video.currentTime = time;
    });

    slider.noUiSlider.on('update', function (values) {
        startVal.innerText = parseFloat(values[0]).toFixed(1) + 's';
        endVal.innerText = parseFloat(values[1]).toFixed(1) + 's';
        durationVal.innerText = 'durée: ' + (values[1] - values[0]).toFixed(1) + 's';
    });
}

function loadVideo(file) {
    if (file) {
        fileLabel.innerText = "📄 " + file.name;
        fileLabel.classList.add('has-file');

        const url = URL.createObjectURL(file);
        video.src = url;
        video.style.display = "block";
        
        video.onloadedmetadata = function() {
            createSlider(video.duration);
            video.play();
        };
    }
}

fileInput.onchange = function(event) {
    const file = event.target.files[0];
    loadVideo(file);
};

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    fileLabel.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    fileLabel.addEventListener(eventName, () => fileLabel.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    fileLabel.addEventListener(eventName, () => fileLabel.classList.remove('dragover'), false);
});

fileLabel.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
        fileInput.files = files;
        loadVideo(files[0]);
    }
}

video.ontimeupdate = function() {
    if (!isSliderCreated) return;
    
    const values = slider.noUiSlider.get();
    const start = parseFloat(values[0]);
    const end = parseFloat(values[1]);

    if (video.currentTime >= end || video.currentTime < start) {
        video.currentTime = start;
        video.play();
    }
};

const form = document.getElementById('uploadForm');
const status = document.getElementById('status');
const bar = document.getElementById('progressBar');
const progressContainer = document.querySelector('.progress');

form.onsubmit = async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    const user = document.getElementById('username').value;
    
    if(!file) return;

    video.pause();

    const values = slider.noUiSlider.get();
    const start = values[0];
    const end = values[1];

    const formData = new FormData();
    formData.append('video', file);
    formData.append('username', user);
    formData.append('startTime', start);
    formData.append('endTime', end);

    progressContainer.style.display = 'block';
    status.innerText = "upload...";

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload', true);

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            bar.style.width = percent + '%';
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            status.innerText = "✅ y a bon";
            form.reset();

            video.pause();
            video.removeAttribute('src');
            video.load();

            video.style.display = "none";
            slider.style.display = "none";
            timeDisplay.style.display = "none";
            progressContainer.style.display = 'none';
            fileLabel.innerText = "fichier vidéo";
            fileLabel.classList.remove('has-file');
            fileLabel.classList.remove('dragover');
        } else {
            status.innerText = "erreur: " + xhr.responseText;
            bar.style.background = 'red';
        }
    };

    xhr.send(formData);
};