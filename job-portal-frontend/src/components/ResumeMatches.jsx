import {formatMatchScore} from "./resumePanelUtils";

const SkillChips = ({skills, variant}) => (
    <span className="resume-skill-chips">
        {skills.map((skill) => (
            <span className={`resume-skill-chip resume-skill-chip-${variant}`} key={skill}>{skill}</span>
        ))}
    </span>
);

const ResumeMatches = ({data, error, isLoading, onRefresh, onRetry}) => {
    if (!data && isLoading) {
        return <p className="resume-match-message" role="status">正在计算岗位技能覆盖率…</p>;
    }

    if (!data && error) {
        return (
            <div className="resume-detail-error" role="alert">
                <span>{error}</span>
                <button className="btn btn-sm btn-outline-secondary" onClick={onRetry} type="button">
                    重试岗位匹配
                </button>
            </div>
        );
    }

    if (!data) {
        return null;
    }

    return (
        <div className="resume-match-content">
            <div className="resume-match-heading">
                <div>
                    <h5>开放岗位技能覆盖</h5>
                    <p>基于 23 个有限技术关键词的技能覆盖率，不代表招聘结论或 AI 评估。</p>
                </div>
                <button
                    className="btn btn-sm btn-outline-secondary"
                    disabled={isLoading}
                    onClick={onRefresh}
                    type="button"
                >
                    {isLoading ? "正在重新计算…" : "重新计算"}
                </button>
            </div>
            {error ? (
                <div className="resume-inline-error" role="alert">
                    <span>{error}</span>
                    <button className="btn btn-sm btn-outline-secondary" onClick={onRetry} type="button">
                        重试岗位匹配
                    </button>
                </div>
            ) : null}
            <div className="resume-detected-skills">
                <span className="metadata-label">简历识别技能</span>
                {data.resumeSkills?.length ? (
                    <SkillChips skills={data.resumeSkills} variant="resume"/>
                ) : (
                    <span className="muted-meta">未识别到当前词典内的技能</span>
                )}
            </div>
            <p className="resume-match-version">规则版本：{data.algorithmVersion || "—"}</p>

            {data.jobs?.length ? (
                <ol className="resume-match-list">
                    {data.jobs.map((job) => (
                        <li className="resume-match-row" key={job.id}>
                            <div className="resume-match-job-heading">
                                <div>
                                    <h6>{job.title}</h6>
                                    <p>{job.company}</p>
                                </div>
                                <span className={`resume-match-score ${job.comparable ? "" : "resume-match-score-na"}`}>
                                    {formatMatchScore(job)}
                                </span>
                            </div>
                            <p className="resume-match-explanation">{job.explanation}</p>
                            {job.matchedSkills?.length ? (
                                <div className="resume-match-skill-row">
                                    <span>已匹配</span>
                                    <SkillChips skills={job.matchedSkills} variant="matched"/>
                                </div>
                            ) : null}
                            {job.missingSkills?.length ? (
                                <div className="resume-match-skill-row">
                                    <span>待补技能</span>
                                    <SkillChips skills={job.missingSkills} variant="missing"/>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="resume-match-message">当前没有开放岗位可供匹配。</p>
            )}
        </div>
    );
};

export default ResumeMatches;
