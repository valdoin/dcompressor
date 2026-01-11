const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

const fileInput = document.getElementById('videoFiles');
const fileLabel = document.getElementById('fileLabel');
const videosList = document.getElementById('videosList');
const form = document.getElementById('uploadForm');
const status = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const addMoreBtn = document.getElementById('addMoreBtn');

let selectedFiles = [];

fileInput.onchange = function(event) {
    const files = Array.from(event.target.files);
    if(files.length > 0) {
        handleFiles(files);
    }
};

addMoreBtn.onclick = function() {
    fileInput.click();
};

function handleFiles(files) {
    fileLabel.classList.add('has-file');
    
    const startIndex = selectedFiles.length;
    files.forEach((file, index) => {
        createVideoItem(file, startIndex + index);
    });

    fileLabel.innerText = `${selectedFiles.length} fichier(s) (drag and drop ou + pour ajouter)`;
    fileInput.value = ''; 
}

function createVideoItem(file, index) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('video-card');

    const title = document.createElement('h4');
    title.classList.add('video-title');
    title.innerText = `#${index+1} - ${file.name}`;

    const video = document.createElement('video');
    video.classList.add('video-preview');
    video.src = URL.createObjectURL(file);
    video.controls = true; 
    
    const timeInfo = document.createElement('div');
    timeInfo.classList.add('time-display');
    timeInfo.innerHTML = `<span>début: <b class="s-val">0.0s</b></span><span>fin: <b class="e-val">0.0s</b></span>`;
    
    const sliderDiv = document.createElement('div');
    sliderDiv.classList.add('slider-container');

    wrapper.appendChild(title);
    wrapper.appendChild(video);
    wrapper.appendChild(timeInfo);
    wrapper.appendChild(sliderDiv);
    videosList.appendChild(wrapper);

    video.onloadedmetadata = function() {
        const duration = video.duration;
        
        noUiSlider.create(sliderDiv, {
            start: [0, duration],
            connect: true,
            range: { 'min': 0, 'max': duration },
            step: 0.1,
            behaviour: 'drag',
        });

        const sVal = timeInfo.querySelector('.s-val');
        const eVal = timeInfo.querySelector('.e-val');

        sliderDiv.noUiSlider.on('slide', function(values, handle) {
             video.pause();
             video.currentTime = parseFloat(values[handle]);
        });

        sliderDiv.noUiSlider.on('update', function(values) {
            sVal.innerText = parseFloat(values[0]).toFixed(1) + 's';
            eVal.innerText = parseFloat(values[1]).toFixed(1) + 's';
        });

        video.ontimeupdate = function() {
            const current = video.currentTime;
            const range = sliderDiv.noUiSlider.get();
            const end = parseFloat(range[1]);
            
            if (current >= end) {
                video.pause();
                video.currentTime = end;
            }
        };

        selectedFiles.push({
            file: file,
            slider: sliderDiv.noUiSlider,
            videoElement: video,
            originalDuration: duration
        });
        
        fileLabel.innerText = `${selectedFiles.length} fichier(s) (drag and drop ou + pour ajouter)`;
    };
}

['dragenter', 'dragover'].forEach(eventName => {
    fileLabel.addEventListener(eventName, e => {
        e.preventDefault(); 
        e.stopPropagation();
        fileLabel.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    fileLabel.addEventListener(eventName, e => {
        e.preventDefault(); 
        e.stopPropagation();
        fileLabel.classList.remove('dragover');
    }, false);
});

fileLabel.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt.files.length > 0) {
        handleFiles(Array.from(dt.files));
    }
}, false);

form.onsubmit = async (e) => {
    e.preventDefault();
    if(selectedFiles.length === 0) return;
    
    const title = document.getElementById('videoTitle').value;
    submitBtn.disabled = true;
    selectedFiles.forEach(obj => obj.videoElement.pause());

    if(!ffmpeg.isLoaded()) {
        try {
            await ffmpeg.load();
        } catch(err) {
            status.innerText = "erreur chargement FFmpeg";
            submitBtn.disabled = false;
            return;
        }
    }

    const formData = new FormData();
    formData.append('title', title);

    for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];
        const values = item.slider.get();
        const start = parseFloat(values[0]);
        const end = parseFloat(values[1]);
        const duration = end - start;

        if (Math.abs(duration - item.originalDuration) < 0.5) {
            formData.append('videos', item.file);
            continue;
        }

        status.innerText = `découpage vidéo ${i+1}/${selectedFiles.length}...`;

        const inputName = `input_${i}.mp4`;
        const outputName = `output_${i}.mp4`;

        ffmpeg.FS('writeFile', inputName, await fetchFile(item.file));

        await ffmpeg.run(
            '-ss', start.toString(),
            '-t', duration.toString(),
            '-i', inputName,
            '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            outputName
        );

        const data = ffmpeg.FS('readFile', outputName);
        const trimmedBlob = new Blob([data.buffer], { type: 'video/mp4' });
        formData.append('videos', trimmedBlob, `trimmed_${i}.mp4`);
        
        ffmpeg.FS('unlink', inputName);
        ffmpeg.FS('unlink', outputName);
    }

    status.innerText = "upload en cours...";

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload', true);

    xhr.onload = () => {
        submitBtn.disabled = false;
        if (xhr.status === 200) {
            status.innerText = "✅ y a bon";
            form.reset();
            videosList.innerHTML = '';
            fileLabel.innerText = "fichiers vidéos";
            fileLabel.classList.remove('has-file');
            selectedFiles = [];
        } else {
            status.innerText = "❌ erreur: " + xhr.responseText;
        }
    };

    xhr.send(formData);
};